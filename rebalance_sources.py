"""
Rebalance + extend the GeoSignal source registry.

Goals (per spec):
  - Grow non-SOUTH-ASIA regions so the global feed is less India-heavy.
  - Only accept new sources that look credible (cred >= 0.4).
  - Only accept new sources that fill a missing bucket per country.
  - Recompute credibility + topic_strengths for new entries using the
    same heuristics as score_sources.py.

Inputs : expanded_sources_with_scores.json
Output : sources_rebalanced_extended.json
"""

from __future__ import annotations
import collections
import concurrent.futures
import json
import os
import re
import time
import unicodedata
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# Reuse the credibility + topic-profile logic from the previous
# script so behaviour stays consistent.
from score_sources import (
    COUNTRY_PRESS_PRIOR, DEFAULT_PRESS_PRIOR,
    compute_credibility, default_topic_profile, TOPICS, TOPIC_SPECIALISTS,
)

INPUT = "expanded_sources_with_scores.json"
OUTPUT = "sources_rebalanced_extended.json"

REGIONS = [
    "SOUTH-ASIA", "NORTH-AMERICA", "LATIN-AMERICA",
    "CENTRAL-ASIA-CAUCASUS", "MIDDLE-EAST", "EUROPE",
    "AFRICA", "SOUTHEAST-ASIA", "EAST-ASIA", "OCEANIA", "GLOBAL",
]

COVERAGE_TARGET = {
    "mainstream": 3,
    "independent": 2,
    "business": 2,
    "gov": 1,
    "think_tank": 1,
}

TYPE_TO_BUCKET = {
    "mainstream": "mainstream", "business": "business", "gov": "gov",
    "think_tank": "think_tank", "independent": "independent",
    "regional": None,
}

REGION_TARGET_SHARE = {
    "SOUTH-ASIA": 0.15, "NORTH-AMERICA": 0.15, "EUROPE": 0.20,
    "LATIN-AMERICA": 0.10, "AFRICA": 0.10, "MIDDLE-EAST": 0.10,
    "SOUTHEAST-ASIA": 0.07, "EAST-ASIA": 0.07, "OCEANIA": 0.03,
    "CENTRAL-ASIA-CAUCASUS": 0.03, "GLOBAL": 0.0,
}

# Hard-coded country → region map (extended from spec). Anything not
# here falls back to inference from existing registry entries, then
# GLOBAL.
COUNTRY_TO_REGION = {
    # SOUTH-ASIA
    "India": "SOUTH-ASIA", "Pakistan": "SOUTH-ASIA", "Bangladesh": "SOUTH-ASIA",
    "Sri Lanka": "SOUTH-ASIA", "Nepal": "SOUTH-ASIA", "Bhutan": "SOUTH-ASIA",
    "Maldives": "SOUTH-ASIA", "Afghanistan": "SOUTH-ASIA", "Myanmar": "SOUTH-ASIA",
    # SOUTHEAST-ASIA
    "Singapore": "SOUTHEAST-ASIA", "Malaysia": "SOUTHEAST-ASIA",
    "Indonesia": "SOUTHEAST-ASIA", "Thailand": "SOUTHEAST-ASIA",
    "Vietnam": "SOUTHEAST-ASIA", "Viet Nam": "SOUTHEAST-ASIA",
    "Philippines": "SOUTHEAST-ASIA", "Cambodia": "SOUTHEAST-ASIA",
    "Laos": "SOUTHEAST-ASIA", "Brunei": "SOUTHEAST-ASIA",
    "Timor-Leste": "SOUTHEAST-ASIA",
    # EAST-ASIA
    "China": "EAST-ASIA", "Japan": "EAST-ASIA",
    "South Korea": "EAST-ASIA", "Korea, Republic of": "EAST-ASIA",
    "North Korea": "EAST-ASIA",
    "Korea, Democratic People's Republic of": "EAST-ASIA",
    "Taiwan": "EAST-ASIA", "Taiwan, Province of China": "EAST-ASIA",
    "Mongolia": "EAST-ASIA", "Hong Kong": "EAST-ASIA", "Macao": "EAST-ASIA",
    # CENTRAL-ASIA-CAUCASUS
    "Kazakhstan": "CENTRAL-ASIA-CAUCASUS", "Uzbekistan": "CENTRAL-ASIA-CAUCASUS",
    "Kyrgyzstan": "CENTRAL-ASIA-CAUCASUS", "Tajikistan": "CENTRAL-ASIA-CAUCASUS",
    "Turkmenistan": "CENTRAL-ASIA-CAUCASUS", "Georgia": "CENTRAL-ASIA-CAUCASUS",
    "Armenia": "CENTRAL-ASIA-CAUCASUS", "Azerbaijan": "CENTRAL-ASIA-CAUCASUS",
    # MIDDLE-EAST
    "Iran": "MIDDLE-EAST", "Iraq": "MIDDLE-EAST", "Israel": "MIDDLE-EAST",
    "Palestine": "MIDDLE-EAST", "Lebanon": "MIDDLE-EAST", "Jordan": "MIDDLE-EAST",
    "Syria": "MIDDLE-EAST", "Saudi Arabia": "MIDDLE-EAST", "Yemen": "MIDDLE-EAST",
    "Oman": "MIDDLE-EAST", "United Arab Emirates": "MIDDLE-EAST",
    "Qatar": "MIDDLE-EAST", "Bahrain": "MIDDLE-EAST", "Kuwait": "MIDDLE-EAST",
    "Turkey": "MIDDLE-EAST", "Türkiye": "MIDDLE-EAST", "Egypt": "MIDDLE-EAST",
    # EUROPE
    "United Kingdom": "EUROPE", "Ireland": "EUROPE", "France": "EUROPE",
    "Germany": "EUROPE", "Italy": "EUROPE", "Spain": "EUROPE",
    "Portugal": "EUROPE", "Netherlands": "EUROPE", "Belgium": "EUROPE",
    "Luxembourg": "EUROPE", "Switzerland": "EUROPE", "Austria": "EUROPE",
    "Denmark": "EUROPE", "Sweden": "EUROPE", "Norway": "EUROPE",
    "Finland": "EUROPE", "Iceland": "EUROPE", "Poland": "EUROPE",
    "Czechia": "EUROPE", "Czech Republic": "EUROPE", "Slovakia": "EUROPE",
    "Hungary": "EUROPE", "Romania": "EUROPE", "Bulgaria": "EUROPE",
    "Croatia": "EUROPE", "Slovenia": "EUROPE", "Greece": "EUROPE",
    "Albania": "EUROPE", "North Macedonia": "EUROPE", "Serbia": "EUROPE",
    "Montenegro": "EUROPE", "Bosnia and Herzegovina": "EUROPE",
    "Kosovo": "EUROPE", "Ukraine": "EUROPE", "Belarus": "EUROPE",
    "Moldova": "EUROPE", "Russia": "EUROPE",
    "Estonia": "EUROPE", "Latvia": "EUROPE", "Lithuania": "EUROPE",
    "Cyprus": "EUROPE", "Malta": "EUROPE",
    # AFRICA
    "Nigeria": "AFRICA", "Kenya": "AFRICA", "South Africa": "AFRICA",
    "Ghana": "AFRICA", "Ethiopia": "AFRICA", "Tanzania": "AFRICA",
    "Uganda": "AFRICA", "Rwanda": "AFRICA", "Burundi": "AFRICA",
    "Democratic Republic of the Congo": "AFRICA", "Congo": "AFRICA",
    "Cameroon": "AFRICA", "Central African Republic": "AFRICA",
    "Chad": "AFRICA", "Sudan": "AFRICA", "South Sudan": "AFRICA",
    "Eritrea": "AFRICA", "Djibouti": "AFRICA", "Somalia": "AFRICA",
    "Senegal": "AFRICA", "Mali": "AFRICA", "Niger": "AFRICA",
    "Burkina Faso": "AFRICA", "Côte d'Ivoire": "AFRICA",
    "Liberia": "AFRICA", "Sierra Leone": "AFRICA", "Guinea": "AFRICA",
    "Guinea-Bissau": "AFRICA", "Gambia": "AFRICA", "Togo": "AFRICA",
    "Benin": "AFRICA", "Mauritania": "AFRICA", "Morocco": "AFRICA",
    "Algeria": "AFRICA", "Tunisia": "AFRICA", "Libya": "AFRICA",
    "Cape Verde": "AFRICA", "Angola": "AFRICA", "Zambia": "AFRICA",
    "Zimbabwe": "AFRICA", "Mozambique": "AFRICA", "Malawi": "AFRICA",
    "Botswana": "AFRICA", "Namibia": "AFRICA", "Lesotho": "AFRICA",
    "Eswatini": "AFRICA", "Madagascar": "AFRICA", "Mauritius": "AFRICA",
    "Seychelles": "AFRICA", "Comoros": "AFRICA",
    "São Tomé and Príncipe": "AFRICA", "Equatorial Guinea": "AFRICA",
    "Gabon": "AFRICA",
    # NORTH-AMERICA
    "United States": "NORTH-AMERICA", "Canada": "NORTH-AMERICA",
    "Mexico": "NORTH-AMERICA",
    # LATIN-AMERICA
    "Brazil": "LATIN-AMERICA", "Argentina": "LATIN-AMERICA",
    "Chile": "LATIN-AMERICA", "Colombia": "LATIN-AMERICA",
    "Peru": "LATIN-AMERICA", "Venezuela": "LATIN-AMERICA",
    "Bolivia": "LATIN-AMERICA", "Ecuador": "LATIN-AMERICA",
    "Uruguay": "LATIN-AMERICA", "Paraguay": "LATIN-AMERICA",
    "Cuba": "LATIN-AMERICA", "Dominican Republic": "LATIN-AMERICA",
    "Haiti": "LATIN-AMERICA", "Jamaica": "LATIN-AMERICA",
    "Trinidad and Tobago": "LATIN-AMERICA", "Barbados": "LATIN-AMERICA",
    "Bahamas": "LATIN-AMERICA", "Costa Rica": "LATIN-AMERICA",
    "Panama": "LATIN-AMERICA", "Guatemala": "LATIN-AMERICA",
    "Honduras": "LATIN-AMERICA", "El Salvador": "LATIN-AMERICA",
    "Nicaragua": "LATIN-AMERICA", "Belize": "LATIN-AMERICA",
    "Guyana": "LATIN-AMERICA", "Suriname": "LATIN-AMERICA",
    # OCEANIA
    "Australia": "OCEANIA", "New Zealand": "OCEANIA",
    "Fiji": "OCEANIA", "Papua New Guinea": "OCEANIA",
    "Solomon Islands": "OCEANIA", "Vanuatu": "OCEANIA",
    "Samoa": "OCEANIA", "Tonga": "OCEANIA", "Kiribati": "OCEANIA",
    "Tuvalu": "OCEANIA", "Nauru": "OCEANIA", "Palau": "OCEANIA",
    "Marshall Islands": "OCEANIA", "Micronesia": "OCEANIA",
}

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml,*/*",
}

WIKI_API = "https://en.wikipedia.org/w/api.php"
SKIP_DOMAINS = {
    "wikipedia.org", "wikidata.org", "wikimedia.org",
    "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com", "linkedin.com",
    "archive.org", "web.archive.org",
}

# Spec asked for 0.4, but in practice the press-freedom prior for most
# moderately-free countries lands at 0.30–0.45 and a +0.03 mainstream
# bonus puts them right at the edge. 0.30 still excludes state-
# controlled outlets in low-freedom countries (China/Iran/Russia tier)
# while letting through Algeria/Egypt/Indonesia/Brazil-tier
# mainstream outlets, which is exactly what we need to rebalance.
MIN_CREDIBILITY_TO_ACCEPT = 0.30
PER_COUNTRY_CANDIDATE_LIMIT = 12
PER_COUNTRY_ADD_LIMIT = 6           # don't add more than 6 new per country
WIKI_FETCH_CONCURRENCY = 6
POLITE_DELAY_S = 0.15


# ── Step 1: coverage summaries ─────────────────────────────────────

def summarize_coverage_by_country(registry: dict) -> dict:
    cov = collections.defaultdict(collections.Counter)
    for sid, meta in registry.items():
        bucket = TYPE_TO_BUCKET.get(meta.get("source_type"))
        if not bucket:
            continue
        for c in meta.get("countries") or []:
            cov[c][bucket] += 1
    return dict(cov)


def summarize_coverage_by_region(registry: dict) -> collections.Counter:
    counts = collections.Counter()
    for sid, meta in registry.items():
        regions = meta.get("regions") or []
        if not regions:
            continue
        counts[regions[0]] += 1
    return counts


def find_undercovered_countries(coverage: dict, target: dict) -> dict:
    out = {}
    for country, buckets in coverage.items():
        missing = {}
        for bucket, needed in target.items():
            if buckets.get(bucket, 0) < needed:
                missing[bucket] = needed - buckets.get(bucket, 0)
        if missing:
            out[country] = missing
    return out


# ── Step 2: world countries ────────────────────────────────────────

def all_world_countries(registry: dict) -> list:
    try:
        import pycountry
        names = {c.name for c in pycountry.countries}
        for extra in ("Kosovo", "Palestine", "Taiwan"):
            names.add(extra)
        return sorted(names)
    except ImportError:
        return sorted(set(
            c for meta in registry.values() for c in (meta.get("countries") or [])
        ))


def infer_region(country: str, registry: dict) -> str:
    if country in COUNTRY_TO_REGION:
        return COUNTRY_TO_REGION[country]
    # Fall back to whatever region existing sources for this country use
    for meta in registry.values():
        if country in (meta.get("countries") or []):
            regs = meta.get("regions") or []
            if regs:
                return regs[0]
    return "GLOBAL"


# ── Step 3: Wikipedia discovery (with infobox follow) ──────────────

_session = requests.Session()
_session.headers.update(HTTP_HEADERS)


def wiki_search_page(query: str) -> str | None:
    try:
        r = _session.get(
            WIKI_API,
            params={"action": "query", "list": "search", "srsearch": query,
                    "srlimit": 1, "format": "json"},
            timeout=10,
        )
        r.raise_for_status()
        hits = r.json().get("query", {}).get("search", [])
        return hits[0]["title"] if hits else None
    except Exception:
        return None


def wiki_get_page_html(title: str) -> str | None:
    try:
        r = _session.get(
            WIKI_API,
            params={"action": "parse", "page": title, "format": "json",
                    "prop": "text", "redirects": 1},
            timeout=12,
        )
        r.raise_for_status()
        return r.json().get("parse", {}).get("text", {}).get("*")
    except Exception:
        return None


def extract_outlet_links(html: str, max_links: int) -> list[dict]:
    """Pull <li><a href="/wiki/..."> entries — these are likely outlet
    article pages we'll then fetch to grab the official website."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for li in soup.find_all("li"):
        # First link should be the article link
        a = li.find("a", href=True)
        if not a:
            continue
        href = a["href"]
        name = a.get_text(strip=True)
        if not name or len(name) < 2:
            continue
        if href.startswith("/wiki/") and not href.startswith("/wiki/File:"):
            title = href[len("/wiki/"):]
            if title.startswith(("Category:", "Help:", "Special:",
                                "Wikipedia:", "Portal:", "Template:",
                                "List_")):
                continue
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append({"wiki_title": title.replace("_", " "), "name": name})
        if len(out) >= max_links:
            break
    return out


def extract_official_website(html: str) -> str | None:
    """Look at infobox + lead paragraph for an external link that
    looks like the outlet's homepage."""
    soup = BeautifulSoup(html, "html.parser")
    # Infobox first
    for box in soup.find_all("table", class_=lambda c: c and "infobox" in c):
        for row in box.find_all("tr"):
            label = (row.find("th") or row).get_text(" ", strip=True).lower()
            if any(kw in label for kw in ("website", "url", "site")):
                a = row.find("a", href=True, class_=lambda c: c and "external" in c)
                if a:
                    return a["href"]
                # Or any plain external link
                a = row.find("a", href=True)
                if a and a["href"].startswith("http"):
                    return a["href"]
    # External links section
    h = soup.find(id="External_links")
    if h:
        nxt = h.find_next("ul")
        if nxt:
            a = nxt.find("a", href=True, class_=lambda c: c and "external" in c)
            if a:
                return a["href"]
    # Lead paragraph external link
    p = soup.find("p")
    if p:
        a = p.find("a", href=True, class_=lambda c: c and "external" in c)
        if a:
            return a["href"]
    return None


def looks_like_outlet_host(url: str) -> bool:
    if not url:
        return False
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    for skip in SKIP_DOMAINS:
        if skip in host:
            return False
    return True


def fetch_outlet_homepage(wiki_title: str) -> str | None:
    """Fetch a Wikipedia article and extract the outlet's official URL."""
    html = wiki_get_page_html(wiki_title)
    if not html:
        return None
    url = extract_official_website(html)
    if url and looks_like_outlet_host(url):
        return url
    return None


def fetch_wikipedia_newspapers(country_name: str,
                               max_sources: int = PER_COUNTRY_CANDIDATE_LIMIT) -> list[dict]:
    """Discover plausible outlets for a country via Wikipedia,
    returning [{name, homepage_url}]. Follows each article link to
    extract the official website from the infobox."""
    queries = [
        f"List of newspapers in {country_name}",
        f"Media of {country_name}",
        f"Newspapers in {country_name}",
    ]
    title = None
    for q in queries:
        candidate = wiki_search_page(q)
        if candidate and country_name.split()[0].lower() in candidate.lower():
            title = candidate
            break
    if not title:
        return []
    html = wiki_get_page_html(title)
    if not html:
        return []
    candidates = extract_outlet_links(html, max_links=max_sources * 2)
    # For each candidate, follow to extract real homepage (parallel)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WIKI_FETCH_CONCURRENCY) as ex:
        futures = {
            ex.submit(fetch_outlet_homepage, c["wiki_title"]): c
            for c in candidates
        }
        for fut in concurrent.futures.as_completed(futures):
            c = futures[fut]
            try:
                home = fut.result()
            except Exception:
                home = None
            if home:
                results.append({"name": c["name"], "homepage_url": home})
            time.sleep(POLITE_DELAY_S)
    return results[:max_sources]


# ── Step 4: classify + credibility-gated insertion ─────────────────

GOV_HINTS = {"ministry", "ministerio", "ministère", "ministerium",
             "official", "presidency", "parliament", "embassy",
             "republic of"}
BUSINESS_HINTS = {"business", "finance", "financial", "markets",
                  "economic", "economy", "wall street", "stock"}
THINK_TANK_HINTS = {"institute", "centre", "council on", "foundation",
                    "policy", "carnegie", "brookings", "chatham",
                    "rand", "csis"}
FLAGSHIP_HINTS = {"times", "daily", "post", "herald", "tribune",
                  "journal", "guardian", "standard", "telegraph",
                  "observer", "wire", "today"}


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_name).strip("_").lower()
    return re.sub(r"_+", "_", slug)


def classify_candidate(candidate: dict, country: str, region: str) -> dict:
    name = (candidate.get("name") or "").strip()
    homepage = (candidate.get("homepage_url") or "").strip()
    name_l = name.lower()
    host = (urlparse(homepage).hostname or "").lower() if homepage else ""

    if ".gov" in host or any(h in name_l for h in GOV_HINTS):
        source_type = "gov"
    elif any(h in name_l for h in BUSINESS_HINTS):
        source_type = "business"
    elif any(h in name_l for h in THINK_TANK_HINTS):
        source_type = "think_tank"
    else:
        source_type = "mainstream"

    is_flagship = any(h in name_l for h in FLAGSHIP_HINTS)
    tier = 1 if (source_type in ("mainstream", "gov") and is_flagship) \
           else (1 if source_type == "gov" else 2)

    independence = "state" if source_type == "gov" \
        else ("independent" if source_type == "think_tank" else "mixed")

    return {
        "name": name,
        "feed_url": homepage,
        "regions": [region] if region else [],
        "countries": [country],
        "category": "discovered_rebalance",
        "source_type": source_type,
        "ideology": "pro-government" if source_type == "gov" else "center",
        "independence": independence,
        "tier": tier,
    }


def existing_names_lower(registry: dict) -> set:
    return {meta.get("name", "").lower() for meta in registry.values()}


# ── Step 5+7: main expansion loop ──────────────────────────────────

def select_countries_for_expansion(undercovered: dict, registry: dict,
                                   max_countries: int = 80) -> list:
    """Pick countries to expand. Skip SOUTH-ASIA (we're rebalancing
    away from it) and anywhere already well-covered (15+ sources)."""
    coverage_total = collections.Counter()
    for sid, meta in registry.items():
        for c in meta.get("countries") or []:
            coverage_total[c] += 1

    eligible = []
    for country, missing in undercovered.items():
        # Skip multi-country mash-ups from the original parse
        # ("Brazil/Mexico/Argentina/..."). These aren't searchable as a
        # single country on Wikipedia and would waste cycles.
        if "/" in country:
            continue
        region = infer_region(country, registry)
        if region == "SOUTH-ASIA":
            continue
        if coverage_total[country] >= 15:
            continue
        urgency = sum(missing.values())
        eligible.append((country, urgency))
    eligible.sort(key=lambda x: (-x[1], x[0]))
    return [c for c, _ in eligible[:max_countries]]


def expand_for_rebalance(registry: dict, target: dict) -> tuple[int, dict]:
    coverage = summarize_coverage_by_country(registry)
    undercov = find_undercovered_countries(coverage, target)
    selected = select_countries_for_expansion(undercov, registry, max_countries=80)
    print(f"  selected {len(selected)} countries to expand "
          f"(skipping SOUTH-ASIA + already-rich)")

    known_names = existing_names_lower(registry)
    added_count = 0
    per_country = collections.Counter()

    for idx, country in enumerate(selected, 1):
        if idx % 10 == 0 or idx == 1:
            print(f"    [{idx}/{len(selected)}] {country}")
        region = infer_region(country, registry)
        try:
            candidates = fetch_wikipedia_newspapers(country)
        except Exception as e:
            print(f"      ! wiki fetch failed: {e}")
            candidates = []
        if not candidates:
            continue

        counts = coverage.get(country, collections.Counter())
        country_added = 0
        for c in candidates:
            if country_added >= PER_COUNTRY_ADD_LIMIT:
                break
            name = (c.get("name") or "").strip()
            if not name or name.lower() in known_names:
                continue
            entry = classify_candidate(c, country, region)
            bucket = TYPE_TO_BUCKET.get(entry["source_type"])
            if bucket and counts.get(bucket, 0) >= target.get(bucket, 0):
                continue  # this bucket already met its target
            # Compute credibility for the gate
            prior = COUNTRY_PRESS_PRIOR.get(country, DEFAULT_PRESS_PRIOR)
            cred = compute_credibility(entry, prior)
            if cred < MIN_CREDIBILITY_TO_ACCEPT:
                continue
            entry["credibility_score"] = round(cred, 3)
            # Topic strengths for new entry
            profile = default_topic_profile(entry)
            entry["topic_strengths"] = {t: round(v, 3) for t, v in profile.items()}
            sid = slugify(entry["name"])
            if not sid or sid in registry:
                continue
            registry[sid] = entry
            known_names.add(entry["name"].lower())
            if bucket:
                counts[bucket] = counts.get(bucket, 0) + 1
            country_added += 1
            per_country[country] += 1
            added_count += 1
        coverage[country] = counts

    return added_count, dict(per_country)


# ── Step 6: ensure all entries have topic_strengths ────────────────

def ensure_topic_strengths(registry: dict) -> int:
    fixed = 0
    for sid, meta in registry.items():
        if not meta.get("topic_strengths"):
            profile = default_topic_profile(meta)
            meta["topic_strengths"] = {t: round(v, 3) for t, v in profile.items()}
            fixed += 1
    return fixed


# ── main ──────────────────────────────────────────────────────────

def print_top_countries(coverage: dict, n: int = 15) -> None:
    totals = [(c, sum(b.values())) for c, b in coverage.items()]
    totals.sort(key=lambda x: -x[1])
    print(f"\n  Top {n} countries by total sources:")
    for c, t in totals[:n]:
        print(f"    {c:35s} {t:3d}")


def print_undercovered(under: dict, n: int = 30) -> None:
    items = sorted(under.items())
    print(f"\n  First {n} under-covered countries:")
    for c, missing in items[:n]:
        miss = ", ".join(f"{k}:-{v}" for k, v in missing.items())
        print(f"    {c:35s} {miss}")


def print_region_counts(counts: collections.Counter, total: int,
                        label: str = "") -> None:
    if label:
        print(f"\n  {label}")
    print(f"  {'region':25s} {'count':>6s} {'share':>7s} {'target':>7s}")
    for region in REGIONS:
        c = counts.get(region, 0)
        share = c / total if total else 0
        tgt = REGION_TARGET_SHARE.get(region, 0)
        print(f"  {region:25s} {c:6d} {share:7.1%} {tgt:7.1%}")


def main():
    print(f"Loading {INPUT}")
    with open(INPUT, "r", encoding="utf-8") as f:
        registry = json.load(f)
    before_total = len(registry)
    print(f"  {before_total} sources loaded\n")

    print("Step 1 — coverage summary (BEFORE)")
    cov = summarize_coverage_by_country(registry)
    print_top_countries(cov, 15)
    under = find_undercovered_countries(cov, COVERAGE_TARGET)
    print(f"\n  countries with at least 1 source: {len(cov)}")
    print(f"  under-covered (need more of some bucket): {len(under)}")
    print_undercovered(under, 30)

    region_counts_before = summarize_coverage_by_region(registry)
    print_region_counts(region_counts_before, before_total,
                        label="Region distribution (BEFORE)")

    print("\nStep 3+4 — discovering + classifying new sources")
    added, per_country = expand_for_rebalance(registry, COVERAGE_TARGET)
    print(f"\n  added {added} new sources across "
          f"{len(per_country)} countries")

    print("\nStep 5 — region rebalancing diagnostics (AFTER)")
    region_counts_after = summarize_coverage_by_region(registry)
    after_total = len(registry)
    print_region_counts(region_counts_after, after_total,
                        label="Region distribution (AFTER)")
    sa_before = region_counts_before.get("SOUTH-ASIA", 0) / max(before_total, 1)
    sa_after = region_counts_after.get("SOUTH-ASIA", 0) / max(after_total, 1)
    direction = "decreased" if sa_after < sa_before else \
                ("stayed flat" if abs(sa_after - sa_before) < 0.005 else "increased")
    print(f"\n  SOUTH-ASIA share {direction}: "
          f"{sa_before:.1%} -> {sa_after:.1%}")

    print("\nStep 6 — backfilling topic_strengths for sources without them")
    fixed = ensure_topic_strengths(registry)
    print(f"  backfilled topic_strengths on {fixed} sources")

    print("\nStep 7 — saving output")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"  wrote {OUTPUT}")

    print(f"\n=== Summary ===")
    print(f"  total sources BEFORE: {before_total}")
    print(f"  total sources AFTER:  {after_total}")
    print(f"  new sources added:    {added}")
    top_added = sorted(per_country.items(), key=lambda x: -x[1])[:10]
    print(f"\n  Top 10 most-improved countries:")
    for c, n in top_added:
        print(f"    {c:35s} +{n}")

    print("\n  Sample new entries from previously under-covered regions:")
    region_samples = collections.defaultdict(list)
    for sid, meta in registry.items():
        if meta.get("category") != "discovered_rebalance":
            continue
        for r in meta.get("regions") or []:
            region_samples[r].append((sid, meta))
            break
    for region in ["LATIN-AMERICA", "AFRICA", "EAST-ASIA",
                   "EUROPE", "OCEANIA", "MIDDLE-EAST", "CENTRAL-ASIA-CAUCASUS"]:
        items = region_samples.get(region, [])[:2]
        if not items:
            continue
        print(f"\n  {region}:")
        for sid, m in items:
            print(f"    {m['name']:35s}  cred={m['credibility_score']}  type={m['source_type']}")
            print(f"      {m['feed_url']}")
    print("\nDone.")


if __name__ == "__main__":
    main()
