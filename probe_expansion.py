"""
Parse GEOSIGNAL_SOURCES_EXPANSION_1.txt (which has both regional
source entries and a TOPIC INDEX at the end), probe every URL to
filter out hallucinated / dead links, and emit two JSON outputs:

  expansion_sources_verified.json   — verified regional sources,
    matching the schema of sources_rebalanced_extended.json so they
    can be merged in.
  topic_index_verified.json         — verified topic index entries
    keyed by topic name, each value is a list of
    {name, region, bias, weight, feed_url} sorted by weight desc.

Sections of the input look like:

  === SOUTHEAST-ASIA EXPANSION (adding to existing 56) ===

    [mainstream] additional sources
      - Publication Name (Country)
        https://feed-url/feed | weight:8

  === TOPIC INDEX ===

    [GEOPOLITICS]
      Weight 10: Foreign Policy | us | center-left | https://...

Both shapes are parsed.
"""

from __future__ import annotations
import concurrent.futures
import json
import re
import time
from collections import defaultdict
from urllib.parse import urlparse

import requests

INPUT = r"C:\Users\susri\Downloads\GEOSIGNAL_SOURCES_EXPANSION_1.txt"
OUT_SOURCES = "expansion_sources_verified.json"
OUT_TOPIC_INDEX = "topic_index_verified.json"
OUT_REPORT = "expansion_probe_report.txt"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.5, */*;q=0.1",
}
CONCURRENCY = 25
TIMEOUT = 6


# Region label normalisation — input uses display labels like
# "SOUTHEAST-ASIA EXPANSION" or "LATIN AMERICA EXPANSION". Map them
# to the same uppercase form used in sources_rebalanced_extended.json.
REGION_NORM = {
    "SOUTHEAST-ASIA": "SOUTHEAST-ASIA",
    "EUROPE": "EUROPE",
    "AFRICA": "AFRICA",
    "LATIN AMERICA": "LATIN-AMERICA",
    "LATIN-AMERICA": "LATIN-AMERICA",
    "NORTH AMERICA": "NORTH-AMERICA",
    "NORTH-AMERICA": "NORTH-AMERICA",
    "MIDDLE EAST": "MIDDLE-EAST",
    "MIDDLE-EAST": "MIDDLE-EAST",
    "EAST ASIA": "EAST-ASIA",
    "EAST-ASIA": "EAST-ASIA",
    "OCEANIA": "OCEANIA",
    "CENTRAL-ASIA-CAUCASUS": "CENTRAL-ASIA-CAUCASUS",
    "GLOBAL": "GLOBAL",
}


def slugify_source(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (name or "").strip().lower())
    return s.strip("_")[:64] or "src"


def is_obvious_junk_url(url: str) -> bool:
    if not url:
        return True
    host = (urlparse(url).hostname or "").lower()
    bad = ("wikipedia.org", "facebook.com", "twitter.com", "x.com",
           "instagram.com", "tiktok.com")
    return any(b in host for b in bad)


def probe_url(url: str) -> tuple[bool, str]:
    if not url or is_obvious_junk_url(url):
        return (False, "blocked/empty")
    try:
        # Try HEAD first; many feed hosts disallow it so fall back to GET.
        r = requests.head(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        ct = (r.headers.get("content-type") or "").lower()
        if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
            return (True, f"HEAD 200 {ct.split(';')[0]}")
        if r.status_code in (403, 405, 501, 999):
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, stream=True)
            ct = (r.headers.get("content-type") or "").lower()
            r.close()
            if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
                return (True, f"GET 200 {ct.split(';')[0]}")
        if r.status_code >= 400:
            return (False, f"HTTP {r.status_code}")
        return (False, f"HTTP {r.status_code} (no usable content-type)")
    except requests.exceptions.ConnectTimeout:
        return (False, "connect timeout")
    except requests.exceptions.ReadTimeout:
        return (False, "read timeout")
    except requests.exceptions.SSLError:
        return (False, "SSL error")
    except requests.exceptions.ConnectionError as e:
        return (False, f"connection error: {str(e)[:60]}")
    except Exception as e:
        return (False, f"error: {type(e).__name__}: {str(e)[:60]}")


def parse_file(path: str):
    """Parses the expansion file into (regional_entries, topic_entries)."""
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    regional = []      # list of dicts: name, country, region, category, feed_url, weight
    topic_index = []   # list of dicts: topic, weight, name, region, bias, feed_url

    in_topic_index = False
    current_region = None
    current_category = None
    current_topic = None

    # Patterns
    re_section_header = re.compile(r"^===\s+([A-Z\- ]+?)\s+(?:EXPANSION|INDEX)", re.I)
    re_cat_header = re.compile(r"^\s+\[([a-z\-]+)\]\s+additional sources", re.I)
    re_source_name = re.compile(r"^\s+-\s+(.+?)\s+\(([^)]+)\)\s*$")
    re_source_url = re.compile(r"^\s+(https?://[^\s|]+)(?:\s*\|\s*weight:(\d+))?\s*$")
    re_topic_header = re.compile(r"^\s+\[([A-Z\-]+)\]\s*$")
    re_topic_entry = re.compile(
        r"^\s+Weight\s+(\d+):\s+([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(https?://[^\s]+)\s*$",
        re.I,
    )

    pending_source = None  # (name, country) waiting for URL line

    for line in lines:
        line_rstrip = line.rstrip()
        if not line_rstrip:
            continue

        # Section header
        m = re_section_header.match(line)
        if m:
            label = m.group(1).strip().upper()
            if "INDEX" in line.upper():
                in_topic_index = True
                current_region = None
                current_category = None
            else:
                in_topic_index = False
                current_region = REGION_NORM.get(label, label.replace(" ", "-"))
                current_category = None
            current_topic = None
            continue

        if in_topic_index:
            m = re_topic_header.match(line)
            if m:
                current_topic = m.group(1).upper().strip()
                continue
            m = re_topic_entry.match(line)
            if m and current_topic:
                weight, name, region, bias, url = m.groups()
                topic_index.append({
                    "topic": current_topic,
                    "weight": int(weight),
                    "name": name.strip(),
                    "region": region.strip(),
                    "bias": bias.strip(),
                    "feed_url": url.strip(),
                })
                continue
            continue

        # Regional section
        m = re_cat_header.match(line)
        if m:
            current_category = m.group(1).lower().strip()
            pending_source = None
            continue
        m = re_source_name.match(line)
        if m and current_region and current_category:
            pending_source = (m.group(1).strip(), m.group(2).strip())
            continue
        m = re_source_url.match(line)
        if m and pending_source:
            url = m.group(1).strip()
            weight = int(m.group(2)) if m.group(2) else 5
            name, country = pending_source
            regional.append({
                "name": name,
                "country": country,
                "region": current_region,
                "category": current_category,
                "feed_url": url,
                "weight": weight,
            })
            pending_source = None

    return regional, topic_index


def main():
    print(f"Parsing {INPUT}")
    regional, topic_index = parse_file(INPUT)
    print(f"  {len(regional)} regional entries")
    print(f"  {len(topic_index)} topic-index entries")

    # Dedupe URLs across both lists so we don't probe the same URL twice.
    all_urls = sorted({e["feed_url"] for e in regional} | {e["feed_url"] for e in topic_index})
    print(f"  {len(all_urls)} unique URLs to probe")

    print(f"\nProbing with concurrency={CONCURRENCY}")
    results: dict[str, tuple[bool, str]] = {}
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        future_to_url = {ex.submit(probe_url, u): u for u in all_urls}
        done = 0
        for fut in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[fut]
            results[url] = fut.result()
            done += 1
            if done % 50 == 0:
                print(f"  ...{done}/{len(all_urls)} ({time.time()-start:.1f}s)")
    print(f"  done in {time.time()-start:.1f}s")

    # Filter regional entries to live URLs, build registry-shape dict.
    verified_sources = {}
    dropped_sources = []
    for e in regional:
        ok, reason = results.get(e["feed_url"], (False, "no result"))
        if not ok:
            dropped_sources.append((e["name"], e["feed_url"], reason))
            continue
        sid = slugify_source(e["name"])
        # Avoid collision with existing slug
        base = sid
        i = 2
        while sid in verified_sources:
            sid = f"{base}_{i}"
            i += 1
        verified_sources[sid] = {
            "name": e["name"],
            "feed_url": e["feed_url"],
            "regions": [e["region"]],
            "countries": [c.strip() for c in e["country"].split("/") if c.strip()],
            "category": e["category"],
            "source_type": e["category"],
            "weight": e["weight"],
            "tier": 1 if e["weight"] >= 8 else (2 if e["weight"] >= 5 else 3),
        }

    # Filter + group topic-index entries.
    verified_topic_index = defaultdict(list)
    dropped_topic = []
    for e in topic_index:
        ok, reason = results.get(e["feed_url"], (False, "no result"))
        if not ok:
            dropped_topic.append((e["name"], e["feed_url"], reason))
            continue
        verified_topic_index[e["topic"]].append({
            "name": e["name"],
            "region": e["region"],
            "bias": e["bias"],
            "weight": e["weight"],
            "feed_url": e["feed_url"],
        })
    # Sort each topic's entries by weight desc.
    for t in verified_topic_index:
        verified_topic_index[t].sort(key=lambda x: -x["weight"])

    # Stats
    n_reg = len(verified_sources)
    n_top = sum(len(v) for v in verified_topic_index.values())
    print(f"\n=== Probe results ===")
    print(f"  Regional sources:")
    print(f"    Verified: {n_reg} / {len(regional)} ({100*n_reg/max(len(regional),1):.0f}%)")
    print(f"    Dropped:  {len(dropped_sources)}")
    print(f"  Topic index:")
    print(f"    Verified: {n_top} / {len(topic_index)} ({100*n_top/max(len(topic_index),1):.0f}%)")
    print(f"    Dropped:  {len(dropped_topic)}")

    # Per-region survival
    print(f"\n  Per-region survival:")
    by_region_total = defaultdict(int)
    by_region_verified = defaultdict(int)
    for e in regional:
        by_region_total[e["region"]] += 1
    for sid, meta in verified_sources.items():
        by_region_verified[meta["regions"][0]] += 1
    for r in sorted(by_region_total):
        t, v = by_region_total[r], by_region_verified[r]
        print(f"    {r:25s}  {v:3d} / {t:3d}  ({100*v/t:.0f}%)")

    with open(OUT_SOURCES, "w", encoding="utf-8") as f:
        json.dump(verified_sources, f, ensure_ascii=False, indent=2)
    print(f"\n  wrote {OUT_SOURCES} ({n_reg} sources)")

    with open(OUT_TOPIC_INDEX, "w", encoding="utf-8") as f:
        json.dump(verified_topic_index, f, ensure_ascii=False, indent=2)
    print(f"  wrote {OUT_TOPIC_INDEX} ({len(verified_topic_index)} topics, {n_top} entries)")

    # Report
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write(f"Probe report — {INPUT}\n")
        f.write(f"========================\n\n")
        f.write(f"Regional: {n_reg} verified / {len(regional)} total\n")
        f.write(f"Topic index: {n_top} verified / {len(topic_index)} total\n\n")
        f.write("=== Dropped regional ===\n")
        for n, u, r in sorted(dropped_sources):
            f.write(f"  {n}\n    {u}\n    [{r}]\n")
        f.write("\n=== Dropped topic-index entries ===\n")
        for n, u, r in sorted(dropped_topic):
            f.write(f"  {n}\n    {u}\n    [{r}]\n")
    print(f"  wrote {OUT_REPORT}")
    print("\nDone.")


if __name__ == "__main__":
    main()
