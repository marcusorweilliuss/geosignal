"""
Optional discovery pass: ask Perplexity to surface real news outlets
for under-represented (region, category) gaps, then URL-probe and
merge into the registry.

REQUIRES PERPLEXITY_API_KEY in env. Render has it set; locally you
need a .env or export the variable in your shell.

Why this script exists:
- The ChatGPT-generated expansion file had ~45% URL survival.
- Wikipedia-based discovery (expand_sources.py) had even lower yield.
- An LLM with web access (Perplexity) returns real, current outlets
  with working homepages much more reliably.

Cost estimate:
- ~30 prompts (one per gap), ~$0.05-0.15 each on sonar-pro.
- Total: $2-5 for a full sweep.

Pipeline:
  1. Identify gaps: regions with fewer than TARGET sources per category.
  2. For each gap, ask Perplexity for the top 10 verified outlets.
  3. Parse Perplexity's response into (name, country, RSS URL).
  4. URL-probe every result.
  5. Merge survivors into sources_v2.json.

Usage:
  export PERPLEXITY_API_KEY=pplx-...
  python discover_sources_via_llm.py
"""

from __future__ import annotations
import concurrent.futures
import json
import os
import re
import sys
import time
from collections import defaultdict
from urllib.parse import urlparse

import requests

REG_IN = "sources_v2.json"
REG_OUT = "sources_v3.json"
REPORT = "discovery_report.txt"

API_URL = "https://api.perplexity.ai/chat/completions"
MODEL = "sonar-pro"
API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")

# Per (region, category) targets — gaps below this trigger a query.
TARGETS = {
    "AFRICA":             {"mainstream": 40, "independent-critical": 12, "think-tank-academic": 10, "business": 8, "government-official": 8},
    "LATIN-AMERICA":      {"mainstream": 40, "independent-critical": 12, "think-tank-academic": 10, "business": 8, "government-official": 8},
    "EAST-ASIA":          {"mainstream": 40, "independent-critical": 8,  "think-tank-academic": 10, "business": 8, "government-official": 6},
    "OCEANIA":            {"mainstream": 25, "independent-critical": 6,  "think-tank-academic": 6,  "business": 4, "government-official": 4},
    "MIDDLE-EAST":        {"mainstream": 40, "independent-critical": 12, "think-tank-academic": 10, "business": 8, "government-official": 8},
    "NORTH-AMERICA":      {"mainstream": 40, "independent-critical": 12, "think-tank-academic": 14, "business": 10, "government-official": 8},
    "EUROPE":             {"mainstream": 50, "independent-critical": 14, "think-tank-academic": 14, "business": 10, "government-official": 10},
    "SOUTHEAST-ASIA":     {"mainstream": 40, "independent-critical": 10, "think-tank-academic": 8,  "business": 6, "government-official": 6},
    "CENTRAL-ASIA-CAUCASUS": {"mainstream": 25, "independent-critical": 8, "think-tank-academic": 5, "business": 4, "government-official": 4},
    "GLOBAL":             {"mainstream": 25, "independent-critical": 8,  "think-tank-academic": 14, "business": 6, "government-official": 4},
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
PROBE_TIMEOUT = 6
PROBE_CONCURRENCY = 25


def load_registry():
    with open(REG_IN, "r", encoding="utf-8") as f:
        return json.load(f)


def count_existing(registry):
    """Returns {(region, category): count} from the current registry."""
    counts = defaultdict(int)
    for meta in registry.values():
        cat = meta.get("category") or meta.get("source_type") or "mainstream"
        for region in (meta.get("regions") or []):
            counts[(region, cat)] += 1
    return counts


def identify_gaps(registry):
    counts = count_existing(registry)
    gaps = []
    for region, cat_targets in TARGETS.items():
        for cat, target in cat_targets.items():
            current = counts.get((region, cat), 0)
            if current < target:
                gaps.append((region, cat, current, target))
    return gaps


def query_perplexity(region, category, current, target):
    """Asks Perplexity for the top N verified outlets in a gap. Returns
    a list of {name, country, url} candidates."""
    needed = target - current
    cat_human = {
        "mainstream": "mainstream news outlets",
        "independent-critical": "independent/critical news outlets",
        "think-tank-academic": "think tanks and academic policy publishers",
        "business": "business and economics outlets",
        "government-official": "official government statement sources / state newswires",
    }.get(category, "news outlets")

    prompt = f"""List {needed + 5} real, currently-publishing English-language {cat_human} that cover {region.replace('-', ' ')}.

For each one, return a single line in exactly this format:
NAME | COUNTRY | RSS_OR_FEED_URL

Requirements:
- Must be a real, established publication that exists today (verify via web search).
- The URL must be a working RSS or Atom feed, not the homepage.
- Skip any outlet whose feed you cannot verify.
- Do not include outlets that are obviously blogs, aggregators, or fake.
- One line per outlet. No bullet points. No commentary.
- Do not number the lines."""

    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a knowledgeable researcher of global news media. Return only verified feeds, never invent URLs."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 1500,
    }
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    try:
        r = requests.post(API_URL, json=body, headers=headers, timeout=60)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"  Perplexity error for {region}/{category}: {e}")
        return []

    candidates = []
    for line in content.splitlines():
        line = line.strip()
        if "|" not in line or "http" not in line:
            continue
        # Strip common list markers
        line = re.sub(r"^[-*\d.]+\s*", "", line).strip()
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue
        name, country, url = parts[0], parts[1], parts[-1]
        url_match = re.search(r"https?://[^\s)]+", url)
        if not url_match:
            continue
        candidates.append({"name": name, "country": country, "url": url_match.group(0)})
    return candidates


def probe_url(url):
    try:
        r = requests.head(url, headers=HEADERS, timeout=PROBE_TIMEOUT, allow_redirects=True)
        ct = (r.headers.get("content-type") or "").lower()
        if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
            return True
        if r.status_code in (403, 405, 501, 999):
            r = requests.get(url, headers=HEADERS, timeout=PROBE_TIMEOUT, stream=True)
            ct = (r.headers.get("content-type") or "").lower()
            r.close()
            return r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html"))
        return False
    except Exception:
        return False


def slug(name):
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (name or "").strip().lower())
    return s.strip("_")[:64] or "src"


def main():
    if not API_KEY:
        print("ERROR: PERPLEXITY_API_KEY not set.")
        print("Set it in your shell, then re-run:")
        print("  export PERPLEXITY_API_KEY=pplx-...")
        sys.exit(1)

    registry = load_registry()
    print(f"Loaded {len(registry)} sources from {REG_IN}")

    gaps = identify_gaps(registry)
    print(f"Found {len(gaps)} (region, category) gaps below target")
    for region, cat, current, target in gaps[:20]:
        print(f"  {region:25s} {cat:24s}  {current}/{target}")
    if len(gaps) > 20:
        print(f"  ... and {len(gaps) - 20} more")

    existing_urls = {meta.get("feed_url", "").lower().strip() for meta in registry.values()}
    all_candidates = []
    for i, (region, cat, current, target) in enumerate(gaps, 1):
        print(f"\n[{i}/{len(gaps)}] Querying Perplexity for {region} / {cat}")
        cands = query_perplexity(region, cat, current, target)
        print(f"  got {len(cands)} candidates")
        for c in cands:
            c["region"] = region
            c["category"] = cat
        all_candidates.extend(cands)

    # Dedupe by URL, then probe.
    by_url = {}
    for c in all_candidates:
        u = c["url"].lower().strip()
        if u in existing_urls or u in by_url:
            continue
        by_url[u] = c
    print(f"\nProbing {len(by_url)} unique new URLs")

    survivors = []
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=PROBE_CONCURRENCY) as ex:
        futures = {ex.submit(probe_url, c["url"]): c for c in by_url.values()}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            c = futures[fut]
            if fut.result():
                survivors.append(c)
            done += 1
            if done % 25 == 0:
                print(f"  ...{done}/{len(by_url)} ({time.time()-start:.1f}s)")
    print(f"  done in {time.time()-start:.1f}s — {len(survivors)} survived")

    # Merge into registry.
    added = 0
    for c in survivors:
        sid = slug(c["name"])
        i = 2
        while sid in registry:
            sid = f"{slug(c['name'])}_{i}"; i += 1
        registry[sid] = {
            "name": c["name"],
            "feed_url": c["url"],
            "regions": [c["region"]],
            "countries": [c["country"]],
            "category": c["category"],
            "source_type": c["category"],
            "ideology": "center",
            "independence": "mixed",
            "tier": 2,
            "weight": 5,
            "bias": "center",
            "credibility_score": 0.6,
            "topic_strengths": {},
        }
        added += 1

    print(f"\nAdded {added} new verified sources")
    print(f"Registry size: {len(registry)}")

    with open(REG_OUT, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"Wrote {REG_OUT}")

    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(f"Discovery pass\n")
        f.write(f"==============\n")
        f.write(f"Gaps queried: {len(gaps)}\n")
        f.write(f"Total candidates: {len(all_candidates)}\n")
        f.write(f"After dedupe + probe: {len(survivors)}\n")
        f.write(f"Registry: {len(registry) - added} -> {len(registry)}\n\n")
        f.write("=== Survivors ===\n")
        for c in sorted(survivors, key=lambda x: (x["region"], x["category"], x["name"])):
            f.write(f"  [{c['region']}/{c['category']}] {c['name']} ({c['country']})\n    {c['url']}\n")
    print(f"Wrote {REPORT}")
    print("\nDone. To activate, rename sources_v3.json -> sources_v2.json and redeploy.")


if __name__ == "__main__":
    main()
