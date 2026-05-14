"""
Expand GeoSignal's news source registry to cover every country in the world.

Steps (per the spec):
  0. Constants
  1. Parse GEOSIGNAL_SOURCES.txt
  2. Build SOURCE_REGISTRY
  3. Country coverage summary + under-covered list
  4. World country list (via pycountry)
  5. Discover new sources from Wikipedia (+ optional mediastack)
  6. Classify new candidates
  7. Expand registry for under-covered countries
  8. Write expanded_sources_registry.json + expanded_sources_by_country.yaml
  9. Run everything end-to-end

Designed to be re-runnable; existing entries are preserved.
"""

from __future__ import annotations
import json
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
try:
    import yaml
    HAVE_YAML = True
except ImportError:
    HAVE_YAML = False
try:
    import pycountry
    HAVE_PYCOUNTRY = True
except ImportError:
    HAVE_PYCOUNTRY = False


# ── Step 0: constants ──────────────────────────────────────────────

REGIONS = [
    "SOUTH-ASIA", "NORTH-AMERICA", "LATIN-AMERICA", "CENTRAL-ASIA-CAUCASUS",
    "MIDDLE-EAST", "EUROPE", "AFRICA", "SOUTHEAST-ASIA", "EAST-ASIA",
    "OCEANIA", "GLOBAL",
]

COVERAGE_TARGET = {
    "mainstream": 2,
    "independent": 1,
    "business": 1,
    "gov": 1,
    "think_tank": 1,
}

# Country → GeoSignal region. Bulk-loaded below from a hard-coded
# map. Pycountry doesn't provide region info that matches our buckets.
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
    "Laos": "SOUTHEAST-ASIA", "Lao People's Democratic Republic": "SOUTHEAST-ASIA",
    "Brunei": "SOUTHEAST-ASIA", "Brunei Darussalam": "SOUTHEAST-ASIA",
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
    "Iran": "MIDDLE-EAST", "Iran, Islamic Republic of": "MIDDLE-EAST",
    "Iraq": "MIDDLE-EAST", "Israel": "MIDDLE-EAST", "Palestine": "MIDDLE-EAST",
    "Palestine, State of": "MIDDLE-EAST", "Lebanon": "MIDDLE-EAST",
    "Jordan": "MIDDLE-EAST", "Syria": "MIDDLE-EAST",
    "Syrian Arab Republic": "MIDDLE-EAST", "Saudi Arabia": "MIDDLE-EAST",
    "Yemen": "MIDDLE-EAST", "Oman": "MIDDLE-EAST",
    "United Arab Emirates": "MIDDLE-EAST", "Qatar": "MIDDLE-EAST",
    "Bahrain": "MIDDLE-EAST", "Kuwait": "MIDDLE-EAST",
    "Turkey": "MIDDLE-EAST", "Türkiye": "MIDDLE-EAST",
    "Egypt": "MIDDLE-EAST",
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
    "Moldova": "EUROPE", "Moldova, Republic of": "EUROPE",
    "Russia": "EUROPE", "Russian Federation": "EUROPE",
    "Estonia": "EUROPE", "Latvia": "EUROPE", "Lithuania": "EUROPE",
    "Cyprus": "EUROPE", "Malta": "EUROPE", "Andorra": "EUROPE",
    "Monaco": "EUROPE", "Liechtenstein": "EUROPE",
    "San Marino": "EUROPE", "Holy See (Vatican City State)": "EUROPE",
    "Vatican City": "EUROPE",
    # AFRICA
    "Nigeria": "AFRICA", "Kenya": "AFRICA", "South Africa": "AFRICA",
    "Ghana": "AFRICA", "Ethiopia": "AFRICA", "Tanzania": "AFRICA",
    "Tanzania, United Republic of": "AFRICA", "Uganda": "AFRICA",
    "Rwanda": "AFRICA", "Burundi": "AFRICA",
    "Democratic Republic of the Congo": "AFRICA",
    "Congo, The Democratic Republic of the": "AFRICA",
    "Congo": "AFRICA", "Cameroon": "AFRICA", "Central African Republic": "AFRICA",
    "Chad": "AFRICA", "Sudan": "AFRICA", "South Sudan": "AFRICA",
    "Eritrea": "AFRICA", "Djibouti": "AFRICA", "Somalia": "AFRICA",
    "Senegal": "AFRICA", "Mali": "AFRICA", "Niger": "AFRICA",
    "Burkina Faso": "AFRICA", "Côte d'Ivoire": "AFRICA",
    "Ivory Coast": "AFRICA", "Liberia": "AFRICA", "Sierra Leone": "AFRICA",
    "Guinea": "AFRICA", "Guinea-Bissau": "AFRICA", "Gambia": "AFRICA",
    "Gambia, The": "AFRICA", "Togo": "AFRICA", "Benin": "AFRICA",
    "Mauritania": "AFRICA", "Morocco": "AFRICA", "Algeria": "AFRICA",
    "Tunisia": "AFRICA", "Libya": "AFRICA", "Cape Verde": "AFRICA",
    "Cabo Verde": "AFRICA", "Angola": "AFRICA", "Zambia": "AFRICA",
    "Zimbabwe": "AFRICA", "Mozambique": "AFRICA", "Malawi": "AFRICA",
    "Botswana": "AFRICA", "Namibia": "AFRICA", "Lesotho": "AFRICA",
    "Eswatini": "AFRICA", "Swaziland": "AFRICA", "Madagascar": "AFRICA",
    "Mauritius": "AFRICA", "Seychelles": "AFRICA", "Comoros": "AFRICA",
    "São Tomé and Príncipe": "AFRICA", "Sao Tome and Principe": "AFRICA",
    "Equatorial Guinea": "AFRICA", "Gabon": "AFRICA",
    # NORTH-AMERICA
    "United States": "NORTH-AMERICA", "United States of America": "NORTH-AMERICA",
    "Canada": "NORTH-AMERICA", "Mexico": "NORTH-AMERICA",
    # LATIN-AMERICA
    "Brazil": "LATIN-AMERICA", "Argentina": "LATIN-AMERICA",
    "Chile": "LATIN-AMERICA", "Colombia": "LATIN-AMERICA",
    "Peru": "LATIN-AMERICA", "Venezuela": "LATIN-AMERICA",
    "Venezuela, Bolivarian Republic of": "LATIN-AMERICA",
    "Bolivia": "LATIN-AMERICA",
    "Bolivia, Plurinational State of": "LATIN-AMERICA",
    "Ecuador": "LATIN-AMERICA", "Uruguay": "LATIN-AMERICA",
    "Paraguay": "LATIN-AMERICA", "Cuba": "LATIN-AMERICA",
    "Dominican Republic": "LATIN-AMERICA", "Haiti": "LATIN-AMERICA",
    "Jamaica": "LATIN-AMERICA", "Trinidad and Tobago": "LATIN-AMERICA",
    "Barbados": "LATIN-AMERICA", "Bahamas": "LATIN-AMERICA",
    "Costa Rica": "LATIN-AMERICA", "Panama": "LATIN-AMERICA",
    "Guatemala": "LATIN-AMERICA", "Honduras": "LATIN-AMERICA",
    "El Salvador": "LATIN-AMERICA", "Nicaragua": "LATIN-AMERICA",
    "Belize": "LATIN-AMERICA", "Guyana": "LATIN-AMERICA",
    "Suriname": "LATIN-AMERICA",
    # OCEANIA
    "Australia": "OCEANIA", "New Zealand": "OCEANIA",
    "Fiji": "OCEANIA", "Papua New Guinea": "OCEANIA",
    "Solomon Islands": "OCEANIA", "Vanuatu": "OCEANIA", "Samoa": "OCEANIA",
    "Tonga": "OCEANIA", "Kiribati": "OCEANIA", "Tuvalu": "OCEANIA",
    "Nauru": "OCEANIA", "Palau": "OCEANIA",
    "Marshall Islands": "OCEANIA",
    "Micronesia": "OCEANIA",
    "Micronesia, Federated States of": "OCEANIA",
}

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; GeoSignal-SourceExpander/1.0; "
        "+https://geosignal-6ics.onrender.com)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ── Step 1: parse GEOSIGNAL_SOURCES.txt ────────────────────────────

REGION_LINE = re.compile(r"^={3,}\s+([A-Z][A-Z\-]+)(?:\s+\(\d+\s+sources\))?\s+={3,}")
CATEGORY_LINE = re.compile(r"^\s*\[([a-z\-]+)\]\s*")
SOURCE_LINE = re.compile(r"^\s*-\s+(.+)$")
URL_LINE = re.compile(r"^\s*(https?://\S+)\s*$")
NAME_COUNTRY = re.compile(r"^(.+?)\s*\(([^)]+)\)\s*$")


def parse_sources_file(path: str) -> dict:
    """Parse the GEOSIGNAL_SOURCES.txt produced by the Node script."""
    sources_by_region_category = defaultdict(lambda: defaultdict(list))
    if not os.path.exists(path):
        print(f"WARNING: {path} not found — starting from an empty registry.")
        return sources_by_region_category

    current_region = None
    current_category = None
    pending_source = None  # {"name", "country"} waiting for a URL line

    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    def flush_pending(url=None):
        nonlocal pending_source
        if pending_source and current_region and current_category:
            entry = {
                "name": pending_source["name"],
                "country": pending_source.get("country"),
                "feed_url": url or "",
            }
            sources_by_region_category[current_region][current_category].append(entry)
        pending_source = None

    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip():
            flush_pending()
            continue
        m = REGION_LINE.match(line)
        if m:
            flush_pending()
            current_region = m.group(1).upper()
            current_category = None
            continue
        m = CATEGORY_LINE.match(line)
        if m:
            flush_pending()
            current_category = m.group(1)
            continue
        m = SOURCE_LINE.match(line)
        if m:
            # Source row — has name + optional (country)
            flush_pending()
            payload = m.group(1).strip()
            country = None
            name = payload
            nm = NAME_COUNTRY.match(payload)
            if nm:
                name = nm.group(1).strip()
                country = nm.group(2).strip()
            pending_source = {"name": name, "country": country}
            continue
        m = URL_LINE.match(line.strip())
        if m and pending_source:
            flush_pending(url=m.group(1))
            continue

    flush_pending()
    return {r: dict(cats) for r, cats in sources_by_region_category.items()}


# ── Step 2: build SOURCE_REGISTRY ──────────────────────────────────

CATEGORY_TO_SOURCE_TYPE = {
    "mainstream": "mainstream",
    "regional": "regional",
    "business": "business",
    "government-official": "gov",
    "think-tank-academic": "think_tank",
    "independent-left": "independent",
    "independent-right": "independent",
    "independent-critical": "independent",
}

CATEGORY_TO_IDEOLOGY = {
    "independent-left": "left",
    "independent-right": "right",
    "independent-critical": "unknown",
    "government-official": "pro-government",
}

CATEGORY_TO_INDEPENDENCE = {
    "government-official": "state",
    "think-tank-academic": "independent",
    "independent-left": "independent",
    "independent-right": "independent",
    "independent-critical": "independent",
}


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_name).strip("_").lower()
    return re.sub(r"_+", "_", slug)


def tier_for(source_type: str) -> int:
    return 1 if source_type in ("mainstream", "gov") else 2


def build_source_registry(sources_by_region_category: dict) -> dict:
    registry: dict[str, dict] = {}
    for region, by_cat in sources_by_region_category.items():
        for category, entries in by_cat.items():
            source_type = CATEGORY_TO_SOURCE_TYPE.get(category, "mainstream")
            ideology = CATEGORY_TO_IDEOLOGY.get(category, "center")
            independence = CATEGORY_TO_INDEPENDENCE.get(category, "mixed")
            for e in entries:
                source_id = slugify(e["name"])
                if not source_id:
                    continue
                if source_id in registry:
                    # merge — add region/country
                    existing = registry[source_id]
                    if region not in existing["regions"]:
                        existing["regions"].append(region)
                    if e.get("country") and e["country"] not in existing["countries"]:
                        existing["countries"].append(e["country"])
                    continue
                registry[source_id] = {
                    "name": e["name"],
                    "feed_url": e.get("feed_url") or "",
                    "regions": [region],
                    "countries": [e["country"]] if e.get("country") else [],
                    "category": category,
                    "source_type": source_type,
                    "ideology": ideology,
                    "independence": independence,
                    "tier": tier_for(source_type),
                }
    return registry


# ── Step 3: country coverage ───────────────────────────────────────

TRACKED_TYPES = ("mainstream", "independent", "business", "gov", "think_tank")


def summarize_coverage_by_country(registry: dict) -> dict:
    coverage = defaultdict(lambda: {t: 0 for t in TRACKED_TYPES})
    for entry in registry.values():
        st = entry.get("source_type")
        if st not in TRACKED_TYPES:
            continue
        for c in entry.get("countries", []):
            coverage[c][st] += 1
    return dict(coverage)


def find_undercovered_countries(coverage: dict, target: dict) -> list:
    out = []
    for country, counts in sorted(coverage.items()):
        missing = {}
        for cat, want in target.items():
            have = counts.get(cat, 0)
            if have < want:
                missing[cat] = want - have
        if missing:
            out.append((country, missing))
    return out


# ── Step 4: world country list ─────────────────────────────────────

def all_world_countries() -> list:
    if HAVE_PYCOUNTRY:
        names = {c.name for c in pycountry.countries}
        # commonly-missing / disputed
        for extra in ("Kosovo", "Palestine", "Taiwan"):
            names.add(extra)
        return sorted(names)
    # fallback minimal set (UN-ish)
    return sorted(set(COUNTRY_TO_REGION.keys()))


# ── Step 5: discover new sources ───────────────────────────────────

WIKI_API = "https://en.wikipedia.org/w/api.php"
HOMEPAGE_HINTS = {".gov", ".gob", ".gouv", "official"}
SKIP_DOMAINS = {
    "wikipedia.org", "wikidata.org", "wikimedia.org",
    "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com", "linkedin.com",
}


def wiki_search_page(query: str) -> str | None:
    """Return the title of the best matching Wikipedia page, or None."""
    try:
        r = requests.get(
            WIKI_API,
            params={
                "action": "query", "list": "search", "srsearch": query,
                "srlimit": 1, "format": "json",
            },
            headers=HTTP_HEADERS, timeout=10,
        )
        r.raise_for_status()
        hits = r.json().get("query", {}).get("search", [])
        return hits[0]["title"] if hits else None
    except Exception:
        return None


def wiki_get_page_html(title: str) -> str | None:
    """Fetch the rendered HTML of a Wikipedia article."""
    try:
        r = requests.get(
            WIKI_API,
            params={
                "action": "parse", "page": title, "format": "json",
                "prop": "text", "redirects": 1,
            },
            headers=HTTP_HEADERS, timeout=12,
        )
        r.raise_for_status()
        return r.json().get("parse", {}).get("text", {}).get("*")
    except Exception:
        return None


def extract_newspaper_candidates(html: str, max_sources: int = 15) -> list[dict]:
    """Pull plausible newspaper entries from a Wikipedia list page."""
    soup = BeautifulSoup(html, "html.parser")
    seen_names = set()
    candidates: list[dict] = []

    # First pass: harvest from <li> entries (lists of newspapers).
    for li in soup.find_all("li"):
        text = li.get_text(" ", strip=True)
        if not text or len(text) < 3:
            continue
        # Skip table of contents / nav
        if "External links" in text or "References" in text:
            continue
        # Find the first internal/external link in this list item
        a = li.find("a", href=True)
        if not a:
            continue
        name = a.get_text(strip=True)
        if not name or len(name) < 2:
            continue
        # Avoid duplicates and edit links / refs
        if name.lower() in {"edit", "edit source", "[edit]"}:
            continue
        # Get the homepage from external links if present in same li
        homepage = ""
        ext = li.find("a", href=True, class_=lambda c: c and "external" in c)
        if ext:
            homepage = ext["href"]
        # If first link is to a real newspaper Wikipedia page, fetch
        # the linked article later (we do simple title-based heuristic
        # for now to avoid an extra HTTP hop per source).
        if name.lower() in seen_names:
            continue
        # Skip obvious non-newspaper entries
        if any(skip in name.lower() for skip in ("see also", "references", "external links", "list of")):
            continue
        seen_names.add(name.lower())
        candidates.append({"name": name, "homepage_url": homepage})
        if len(candidates) >= max_sources:
            break

    # Filter out junk URLs (wikipedia, social, etc.)
    cleaned = []
    for c in candidates:
        u = c["homepage_url"]
        if u:
            host = urlparse(u).hostname or ""
            if any(skip in host for skip in SKIP_DOMAINS):
                c["homepage_url"] = ""
        cleaned.append(c)
    return cleaned


def fetch_wikipedia_newspapers(country_name: str, max_sources: int = 15) -> list[dict]:
    """
    Hit Wikipedia for "List of newspapers in {country}" / fallbacks and
    return up to max_sources [{name, homepage_url}].
    """
    queries = [
        f"List of newspapers in {country_name}",
        f"Media in {country_name}",
        f"Newspapers in {country_name}",
    ]
    for q in queries:
        title = wiki_search_page(q)
        if not title:
            continue
        html = wiki_get_page_html(title)
        if not html:
            continue
        candidates = extract_newspaper_candidates(html, max_sources=max_sources)
        # Filter out obvious cruft after extraction
        candidates = [
            c for c in candidates
            if c["name"] and len(c["name"]) >= 2
            and not c["name"].lower().startswith(("list of", "category:", "see "))
        ]
        if candidates:
            return candidates[:max_sources]
    return []


def fetch_api_sources_for_country(country_name: str, max_sources: int = 15) -> list[dict]:
    api_key = os.environ.get("MEDIASTACK_API_KEY")
    if not api_key:
        return []
    # Mediastack expects 2-letter country codes — try pycountry to convert.
    code = None
    if HAVE_PYCOUNTRY:
        try:
            c = pycountry.countries.lookup(country_name)
            code = c.alpha_2.lower()
        except Exception:
            return []
    if not code:
        return []
    try:
        r = requests.get(
            "http://api.mediastack.com/v1/sources",
            params={
                "access_key": api_key, "countries": code,
                "languages": "en", "limit": max_sources,
            },
            timeout=12,
        )
        r.raise_for_status()
        data = r.json().get("data") or []
        return [
            {"name": s.get("name", ""), "homepage_url": s.get("url", "")}
            for s in data if s.get("name")
        ]
    except Exception:
        return []


# ── Step 6: classify candidates ────────────────────────────────────

GOV_HINTS = {"ministry", "ministerio", "ministère", "ministerium", "official",
             "presidency", "parliament", "embassy", "republic of"}
BUSINESS_HINTS = {"business", "finance", "financial", "markets", "economic", "economy",
                  "wall street", "stock", "trade journal"}
THINK_TANK_HINTS = {"institute", "centre", "center ", "council on", "foundation",
                    "policy", "carnegie", "brookings", "chatham", "rand", "csis"}
FLAGSHIP_HINTS = {"times", "daily", "post", "herald", "tribune", "journal",
                  "guardian", "standard", "telegraph", "observer", "wire", "today"}


def guess_feed_url(homepage: str) -> str:
    """Return a likely RSS URL, falling back to the homepage."""
    if not homepage:
        return ""
    base = homepage.rstrip("/")
    # don't try anything if homepage isn't http
    if not base.startswith("http"):
        return homepage
    # Quick heuristic — return the homepage as a placeholder. We don't
    # actually probe candidate paths here (too many HTTP calls). Caller
    # can run a separate "feed verifier" pass later.
    return homepage


def classify_new_source(candidate: dict, country_name: str, region_name: str) -> dict:
    name = candidate.get("name", "").strip()
    homepage = candidate.get("homepage_url", "").strip()
    name_l = name.lower()
    host = (urlparse(homepage).hostname or "").lower() if homepage else ""

    # type
    if ".gov" in host or any(h in name_l for h in GOV_HINTS):
        source_type = "gov"
    elif any(h in name_l for h in BUSINESS_HINTS):
        source_type = "business"
    elif any(h in name_l for h in THINK_TANK_HINTS):
        source_type = "think_tank"
    else:
        source_type = "mainstream"

    ideology = "pro-government" if source_type == "gov" else "center"
    independence = "state" if source_type == "gov" else "mixed"
    if source_type == "think_tank":
        independence = "independent"

    # tier — bump flagship-looking names to tier 1
    is_flagship = any(h in name_l for h in FLAGSHIP_HINTS)
    tier = 1 if (source_type in ("mainstream", "gov") and is_flagship) \
           else (1 if source_type == "gov" else 2)

    return {
        "name": name,
        "feed_url": guess_feed_url(homepage),
        "regions": [region_name] if region_name else [],
        "countries": [country_name],
        "category": "discovered",
        "source_type": source_type,
        "ideology": ideology,
        "independence": independence,
        "tier": tier,
    }


# ── Step 7: expansion loop ─────────────────────────────────────────

def existing_names_in_registry(registry: dict) -> set:
    return {entry["name"].lower() for entry in registry.values()}


def expand_registry(
    registry: dict,
    countries: list[str],
    target: dict,
    *,
    polite_delay_s: float = 0.4,
    log_every: int = 25,
) -> tuple[int, dict]:
    """Mutates `registry` in place. Returns (added_count, per_country_added)."""
    coverage = summarize_coverage_by_country(registry)
    known_names = existing_names_in_registry(registry)
    per_country_added: dict[str, int] = defaultdict(int)
    added_count = 0

    for idx, country in enumerate(countries, 1):
        if idx % log_every == 0 or idx == 1:
            print(f"  [{idx}/{len(countries)}] {country}")
        counts = coverage.get(country, {t: 0 for t in TRACKED_TYPES})
        missing_total = sum(max(0, target.get(t, 0) - counts.get(t, 0))
                            for t in TRACKED_TYPES)
        if missing_total == 0:
            continue
        region = COUNTRY_TO_REGION.get(country, "GLOBAL")
        wiki_candidates = fetch_wikipedia_newspapers(country, max_sources=15)
        api_candidates = fetch_api_sources_for_country(country, max_sources=15)
        candidates = wiki_candidates + api_candidates
        if polite_delay_s:
            time.sleep(polite_delay_s)
        if not candidates:
            continue
        for c in candidates:
            if not c.get("name"):
                continue
            if c["name"].lower() in known_names:
                continue
            entry = classify_new_source(c, country, region)
            # Drop if we'd be adding to a type that's already at target
            st = entry["source_type"]
            if st in TRACKED_TYPES:
                if counts.get(st, 0) >= target.get(st, 0):
                    continue
                counts[st] = counts.get(st, 0) + 1
            sid = slugify(entry["name"])
            if not sid or sid in registry:
                continue
            registry[sid] = entry
            known_names.add(entry["name"].lower())
            per_country_added[country] += 1
            added_count += 1
            # Stop early when target is met for this country
            still_missing = sum(max(0, target.get(t, 0) - counts.get(t, 0))
                                for t in TRACKED_TYPES)
            if still_missing == 0:
                break
        coverage[country] = counts

    return added_count, dict(per_country_added)


# ── Step 8: write outputs ──────────────────────────────────────────

def registry_to_by_country(registry: dict) -> dict:
    by_country = defaultdict(lambda: defaultdict(list))
    for entry in registry.values():
        for country in entry.get("countries") or ["(unknown)"]:
            bucket = entry.get("source_type", "other")
            if bucket not in TRACKED_TYPES:
                bucket = "other"
            by_country[country][bucket].append({
                "name": entry["name"],
                "feed_url": entry.get("feed_url", ""),
                "tier": entry.get("tier", 2),
                "ideology": entry.get("ideology", "center"),
                "independence": entry.get("independence", "mixed"),
            })
    return {c: dict(b) for c, b in by_country.items()}


def write_outputs(registry: dict, by_country: dict):
    with open("expanded_sources_registry.json", "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print("  wrote expanded_sources_registry.json")
    if HAVE_YAML:
        with open("expanded_sources_by_country.yaml", "w", encoding="utf-8") as f:
            yaml.dump(by_country, f, allow_unicode=True, sort_keys=True)
        print("  wrote expanded_sources_by_country.yaml")
    else:
        with open("expanded_sources_by_country.json", "w", encoding="utf-8") as f:
            json.dump(by_country, f, ensure_ascii=False, indent=2)
        print("  PyYAML unavailable — wrote expanded_sources_by_country.json instead")


# ── Step 9: run everything ─────────────────────────────────────────

def main():
    print("Step 1 — parsing GEOSIGNAL_SOURCES.txt")
    by_region_cat = parse_sources_file("GEOSIGNAL_SOURCES.txt")
    region_count = sum(len(v) for v in by_region_cat.values() if isinstance(v, dict))
    print(f"  parsed {len(by_region_cat)} regions, "
          f"{sum(len(items) for cats in by_region_cat.values() for items in cats.values())} raw entries")

    print("\nStep 2 — building SOURCE_REGISTRY")
    registry = build_source_registry(by_region_cat)
    print(f"  registry size: {len(registry)} unique sources")
    for sid in list(registry.keys())[:10]:
        e = registry[sid]
        print(f"  · {sid:30s} {e['name'][:35]:35s} {e['source_type']:11s} {e.get('countries', [''])[0] if e['countries'] else '-'}")

    print("\nStep 3 — country coverage summary")
    coverage = summarize_coverage_by_country(registry)
    print(f"  countries with at least 1 source: {len(coverage)}")
    under = find_undercovered_countries(coverage, COVERAGE_TARGET)
    print(f"  under-covered countries (need expansion): {len(under)}")
    print("  first 30 under-covered countries + missing buckets:")
    for country, missing in under[:30]:
        miss_str = ", ".join(f"{k}:-{v}" for k, v in missing.items())
        print(f"    - {country:35s} {miss_str}")

    print("\nStep 4 — world country list")
    countries = all_world_countries()
    print(f"  world countries to consider: {len(countries)} (pycountry: {HAVE_PYCOUNTRY})")

    print("\nStep 7 — expanding registry from Wikipedia for under-covered countries")
    before = len(registry)
    added, per_country = expand_registry(registry, countries, COVERAGE_TARGET)
    after = len(registry)
    print(f"\n  before: {before} sources")
    print(f"  after:  {after} sources")
    print(f"  added:  {added}")
    top = sorted(per_country.items(), key=lambda x: -x[1])[:15]
    print("  most-expanded countries:")
    for c, n in top:
        print(f"    - {c:30s} +{n}")

    print("\nStep 8 — writing outputs")
    by_country = registry_to_by_country(registry)
    write_outputs(registry, by_country)

    print("\nDone.")


if __name__ == "__main__":
    main()
