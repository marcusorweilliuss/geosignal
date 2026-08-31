"""
Verify each newly-discovered source by probing its URL.
Keeps entries that return a real news page; drops dead URLs and
obvious junk (Wikipedia-extracted names that aren't real outlets).

Inputs:  expanded_sources_registry.json
Outputs:
  expanded_sources_registry_clean.json  (verified, deduplicated)
  expand_cleanup_report.txt             (what was dropped + why)
"""

from __future__ import annotations
import concurrent.futures
import json
import re
import time
import unicodedata
from collections import defaultdict
from urllib.parse import urlparse

import requests

INPUT = "expanded_sources_registry.json"
OUTPUT = "expanded_sources_registry_clean.json"
REPORT = "expand_cleanup_report.txt"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml,*/*",
}

# Concurrency + per-request budget. The list is ~441 new URLs so 25
# workers × ~3s each ≈ 60s total.
CONCURRENCY = 25
PER_REQUEST_TIMEOUT = 6


# Names that are obvious noise from Wikipedia parsing. These show up
# because the regex grabbed list-items from infoboxes / unrelated pages.
NAME_BLOCKLIST_EXACT = {
    "[1]", "[2]", "[3]", "[edit]", "Edit", "Show", "Hide",
    "English", "French", "Spanish", "Arabic", "German", "Portuguese",
    "Russian", "Chinese", "Italian", "Korean", "Hindi", "Bengali",
    "Wikipedia", "Wikidata", "Commons",
}
NAME_BLOCKLIST_PATTERNS = [
    re.compile(r"^\[\d+\]$"),
    re.compile(r"^\([^)]+\)$"),
    re.compile(r"^See also$", re.I),
    re.compile(r"^Citation needed", re.I),
    re.compile(r"^(?:External|Web)\s+links?$", re.I),
]


def is_blocklisted_name(name: str) -> bool:
    n = (name or "").strip()
    if not n:
        return True
    if n in NAME_BLOCKLIST_EXACT:
        return True
    # Plain language names (one capitalized word) are almost always noise
    if " " not in n and n.istitle() and len(n) < 15:
        # but real outlets with single-word names exist (e.g. Reuters).
        # so only drop if the word matches a known language list.
        if n in NAME_BLOCKLIST_EXACT:
            return True
    for re_ in NAME_BLOCKLIST_PATTERNS:
        if re_.match(n):
            return True
    return False


def is_personal_name(name: str) -> bool:
    """Detect obvious person names like 'Hovhannes Kajaznuni' — two
    capitalized words, no news-y keywords, no domain pattern. Crude
    but catches the main offenders."""
    parts = (name or "").strip().split()
    if len(parts) != 2:
        return False
    if not all(p[:1].isupper() and p[1:].islower() for p in parts):
        return False
    news_words = {"News", "Times", "Post", "Tribune", "Herald", "Daily",
                  "Press", "Mail", "Standard", "Express", "Journal",
                  "Wire", "Today", "Report", "Online", "Magazine",
                  "Weekly", "Monthly", "Observer", "Telegraph", "Star",
                  "Sun", "Globe", "Gazette", "Bulletin", "Chronicle"}
    if any(p in news_words for p in parts):
        return False
    return True


def is_obviously_non_news_url(url: str) -> bool:
    if not url:
        return False
    host = (urlparse(url).hostname or "").lower()
    bad = ("wikipedia.org", "wikimedia.org", "wikidata.org", "youtube.com",
           "facebook.com", "twitter.com", "x.com", "instagram.com",
           "tiktok.com", "linkedin.com", "archive.org", "web.archive.org")
    return any(b in host for b in bad)


def probe_url(url: str) -> tuple[bool, str]:
    """Return (is_alive_news_page, reason). Tries HEAD first, then GET."""
    if not url:
        return (False, "empty url")
    if is_obviously_non_news_url(url):
        return (False, "non-news host (wikipedia/social/etc.)")
    try:
        # HEAD is faster but many news sites disallow it. Fall back to
        # a short GET on 405/501 or if HEAD doesn't return content-type.
        r = requests.head(url, headers=HEADERS, timeout=PER_REQUEST_TIMEOUT, allow_redirects=True)
        ct = r.headers.get("content-type", "").lower()
        if r.status_code == 200 and ("html" in ct or "xml" in ct or "rss" in ct or "atom" in ct):
            return (True, f"HEAD 200 {ct.split(';')[0]}")
        if r.status_code in (405, 501):
            r = requests.get(url, headers=HEADERS, timeout=PER_REQUEST_TIMEOUT, stream=True)
            ct = r.headers.get("content-type", "").lower()
            r.close()
            if r.status_code == 200 and ("html" in ct or "xml" in ct or "rss" in ct or "atom" in ct):
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


def main():
    print(f"Loading {INPUT}")
    with open(INPUT, "r", encoding="utf-8") as f:
        registry = json.load(f)
    total_before = len(registry)
    print(f"  {total_before} sources total")

    # Three buckets:
    #   - kept_existing: original entries (category != 'discovered'). Trust these.
    #   - probe: newly-added entries. Verify each URL.
    #   - dropped: discarded entries with reason.
    kept_existing = {}
    to_probe = {}
    dropped_pre = []  # dropped without probing (bad name / bad URL)

    for sid, meta in registry.items():
        if meta.get("category") != "discovered":
            kept_existing[sid] = meta
            continue
        name = meta.get("name", "")
        url = meta.get("feed_url", "")
        if is_blocklisted_name(name):
            dropped_pre.append((sid, name, url, "blocklisted name (junk)"))
            continue
        if is_personal_name(name):
            dropped_pre.append((sid, name, url, "looks like a person's name"))
            continue
        if not url:
            dropped_pre.append((sid, name, url, "no URL to verify"))
            continue
        to_probe[sid] = meta

    print(f"\n  trusted (original): {len(kept_existing)}")
    print(f"  to probe (new):     {len(to_probe)}")
    print(f"  dropped pre-probe:  {len(dropped_pre)}")

    if to_probe:
        print(f"\nProbing {len(to_probe)} URLs with concurrency={CONCURRENCY}")
        results: dict[str, tuple[bool, str]] = {}
        sids = list(to_probe.keys())
        start = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            future_to_sid = {
                ex.submit(probe_url, to_probe[sid].get("feed_url", "")): sid
                for sid in sids
            }
            done = 0
            for fut in concurrent.futures.as_completed(future_to_sid):
                sid = future_to_sid[fut]
                results[sid] = fut.result()
                done += 1
                if done % 50 == 0:
                    print(f"  ...{done}/{len(sids)} probed ({time.time()-start:.1f}s)")
        print(f"  probing done in {time.time()-start:.1f}s")
    else:
        results = {}

    kept_new = {}
    dropped_probe = []
    for sid, meta in to_probe.items():
        ok, reason = results.get(sid, (False, "no result"))
        if ok:
            kept_new[sid] = meta
        else:
            dropped_probe.append((sid, meta.get("name"), meta.get("feed_url"), reason))

    final = {**kept_existing, **kept_new}
    total_after = len(final)

    # Stats by reason
    drop_reasons = defaultdict(int)
    for _, _, _, r in dropped_pre + dropped_probe:
        drop_reasons[r] += 1

    print(f"\n=== Cleanup summary ===")
    print(f"  before:           {total_before}")
    print(f"  kept (original):  {len(kept_existing)}")
    print(f"  kept (new, OK):   {len(kept_new)}")
    print(f"  dropped pre:      {len(dropped_pre)}")
    print(f"  dropped on probe: {len(dropped_probe)}")
    print(f"  after:            {total_after}")
    print(f"\n  Drop reasons:")
    for r, n in sorted(drop_reasons.items(), key=lambda x: -x[1])[:10]:
        print(f"    {n:4d}  {r}")

    # Write outputs
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)
    print(f"\n  wrote {OUTPUT} ({total_after} sources)")

    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(f"Cleanup report\n")
        f.write(f"=================\n")
        f.write(f"Before: {total_before}\n")
        f.write(f"After:  {total_after}\n")
        f.write(f"Dropped pre-probe: {len(dropped_pre)}\n")
        f.write(f"Dropped on probe:  {len(dropped_probe)}\n\n")
        f.write("=== Dropped pre-probe ===\n")
        for sid, name, url, reason in sorted(dropped_pre):
            f.write(f"  {name}  [{reason}]\n")
            if url:
                f.write(f"    {url}\n")
        f.write("\n=== Dropped on probe ===\n")
        for sid, name, url, reason in sorted(dropped_probe):
            f.write(f"  {name}  [{reason}]\n")
            f.write(f"    {url}\n")
    print(f"  wrote {REPORT}")
    print("\nDone.")


if __name__ == "__main__":
    main()
