"""
Curated set of tier-1 research / consulting / political-risk /
investment-bank-research sources to add to sources_v3.json. URLs are
probed before inclusion.

Run: python add_research_sources.py
"""

from __future__ import annotations
import concurrent.futures
import json
import re
import time

import requests

REG = "sources_v3.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
TIMEOUT = 6

# (name, country, region, category, feed_url, weight)
CANDIDATES = [
    # ── Consulting / management research ──
    ("McKinsey Insights", "United States", "GLOBAL", "think-tank-academic",
     "https://www.mckinsey.com/featured-insights/rss", 8),
    ("McKinsey & Company", "United States", "GLOBAL", "think-tank-academic",
     "https://www.mckinsey.com/insights/rss", 8),
    ("BCG Insights", "United States", "GLOBAL", "think-tank-academic",
     "https://www.bcg.com/featured-insights/rss", 7),
    ("Bain & Company", "United States", "GLOBAL", "think-tank-academic",
     "https://www.bain.com/insights/rss/", 7),
    ("Accenture Insights", "United States", "GLOBAL", "think-tank-academic",
     "https://www.accenture.com/us-en/feeds/insights", 6),
    ("Roland Berger", "Germany", "EUROPE", "think-tank-academic",
     "https://www.rolandberger.com/en/Insights/rss/", 6),
    ("Oliver Wyman", "United States", "GLOBAL", "think-tank-academic",
     "https://www.oliverwyman.com/our-expertise.feed.html", 6),
    ("KPMG Insights", "Netherlands", "GLOBAL", "think-tank-academic",
     "https://home.kpmg/xx/en/home/insights.rss.feed.html", 6),
    ("PwC Insights", "United Kingdom", "GLOBAL", "think-tank-academic",
     "https://www.pwc.com/gx/en/about.feed.html", 6),

    # ── Political-risk specialists ──
    ("Eurasia Group", "United States", "GLOBAL", "think-tank-academic",
     "https://www.eurasiagroup.net/rss", 9),
    ("GZERO Media", "United States", "GLOBAL", "independent-critical",
     "https://www.gzeromedia.com/rss.xml", 7),
    ("Geopolitical Futures", "United States", "GLOBAL", "think-tank-academic",
     "https://geopoliticalfutures.com/feed/", 7),
    ("Control Risks", "United Kingdom", "GLOBAL", "think-tank-academic",
     "https://www.controlrisks.com/rss/our-thinking", 7),
    ("Stratfor", "United States", "GLOBAL", "think-tank-academic",
     "https://worldview.stratfor.com/rss", 7),
    ("Foreign Affairs Magazine", "United States", "GLOBAL", "think-tank-academic",
     "https://www.foreignaffairs.com/rss.xml", 9),

    # ── Investment-bank research (where RSS is public) ──
    ("Goldman Sachs Insights", "United States", "GLOBAL", "business",
     "https://www.goldmansachs.com/intelligence/feed.xml", 8),
    ("JP Morgan Research", "United States", "GLOBAL", "business",
     "https://www.jpmorgan.com/insights/feed", 8),
    ("Morgan Stanley Ideas", "United States", "GLOBAL", "business",
     "https://www.morganstanley.com/ideas/atom-feed.xml", 8),
    ("BlackRock Insights", "United States", "GLOBAL", "business",
     "https://www.blackrock.com/corporate/literature/rss/blackrock-investment-institute-rss.xml", 7),
    ("Schroders Insights", "United Kingdom", "GLOBAL", "business",
     "https://www.schroders.com/en/insights/feed/", 6),
    ("State Street Insights", "United States", "GLOBAL", "business",
     "https://www.statestreet.com/web/info/feeds/insights.rss", 6),

    # ── Multilateral / IFI research blogs ──
    ("IMF Blog", "United States", "GLOBAL", "think-tank-academic",
     "https://www.imf.org/en/Blogs/rss", 8),
    ("World Bank Blogs", "United States", "GLOBAL", "think-tank-academic",
     "https://blogs.worldbank.org/feed", 8),
    ("OECD Newsroom", "France", "GLOBAL", "think-tank-academic",
     "https://www.oecd.org/news/rss.xml", 7),
    ("WTO News", "Switzerland", "GLOBAL", "government-official",
     "https://www.wto.org/english/news_e/news_rss_feed_e.xml", 6),

    # ── Tech / cyber / AI policy (Google TAG too) ──
    ("Google Threat Analysis Group", "United States", "GLOBAL", "independent-critical",
     "https://blog.google/threat-analysis-group/rss/", 7),
    ("Mandiant Threat Research", "United States", "GLOBAL", "independent-critical",
     "https://www.mandiant.com/resources/blog/rss.xml", 6),
    ("Citizen Lab", "Canada", "GLOBAL", "think-tank-academic",
     "https://citizenlab.ca/feed/", 8),
    ("AI Now Institute", "United States", "GLOBAL", "think-tank-academic",
     "https://ainowinstitute.org/feed/", 7),
    ("Center for AI Safety", "United States", "GLOBAL", "think-tank-academic",
     "https://www.safe.ai/feed/", 6),
    ("Future of Life Institute", "United States", "GLOBAL", "think-tank-academic",
     "https://futureoflife.org/feed/", 6),
    ("Electronic Frontier Foundation", "United States", "GLOBAL", "independent-critical",
     "https://www.eff.org/rss/updates.xml", 7),

    # ── Climate / ESG specialists ──
    ("MSCI ESG Research", "United States", "GLOBAL", "business",
     "https://www.msci.com/our-solutions/esg-investing/feed", 6),
    ("Sustainalytics", "Netherlands", "GLOBAL", "business",
     "https://www.sustainalytics.com/feed/", 6),
    ("ClimateWorks Foundation", "United States", "GLOBAL", "think-tank-academic",
     "https://www.climateworks.org/feed/", 6),
]

DEFAULT_TOPICS_BY_CATEGORY = {
    "think-tank-academic": {"politics_domestic": 0.7, "politics_foreign": 0.9, "business_markets": 0.5, "science_tech": 0.5, "climate_energy": 0.6, "human_rights_conflict": 0.7, "culture_society": 0.4},
    "business":            {"politics_domestic": 0.5, "business_markets": 0.95, "climate_energy": 0.5, "science_tech": 0.4, "human_rights_conflict": 0.2},
    "independent-critical": {"politics_domestic": 0.7, "politics_foreign": 0.7, "human_rights_conflict": 0.8, "science_tech": 0.6, "culture_society": 0.5, "climate_energy": 0.5},
    "government-official": {"politics_domestic": 0.4, "politics_foreign": 0.4, "business_markets": 0.3},
}

COUNTRY_PRIOR = {
    "United States": 0.78, "United Kingdom": 0.78, "Canada": 0.85,
    "Germany": 0.85, "France": 0.78, "Netherlands": 0.88, "Switzerland": 0.85,
}


def slug(name):
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower())
    return s.strip("_")[:64] or "src"


def probe(url):
    try:
        r = requests.head(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        ct = (r.headers.get("content-type") or "").lower()
        if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
            return True
        if r.status_code in (403, 405, 501, 999):
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, stream=True)
            ct = (r.headers.get("content-type") or "").lower()
            r.close()
            return r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html"))
        return False
    except Exception:
        return False


def main():
    with open(REG, "r", encoding="utf-8") as f:
        registry = json.load(f)
    existing_urls = {meta.get("feed_url", "").lower().strip(): sid for sid, meta in registry.items() if meta.get("feed_url")}
    print(f"Registry: {len(registry)} before")

    print(f"Probing {len(CANDIDATES)} candidates ...")
    survivors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as ex:
        future_map = {ex.submit(probe, c[4]): c for c in CANDIDATES}
        for fut in concurrent.futures.as_completed(future_map):
            c = future_map[fut]
            ok = fut.result()
            if ok:
                survivors.append(c)
            else:
                print(f"  DROP {c[0]} -> {c[4]}")
    print(f"  {len(survivors)} survived URL probe")

    added = skipped = 0
    for name, country, region, category, url, weight in survivors:
        url_key = url.lower().strip()
        if url_key in existing_urls:
            skipped += 1
            continue
        sid = slug(name)
        i = 2
        while sid in registry:
            sid = f"{slug(name)}_{i}"; i += 1
        prior = COUNTRY_PRIOR.get(country, 0.65)
        topics = DEFAULT_TOPICS_BY_CATEGORY.get(category, DEFAULT_TOPICS_BY_CATEGORY["think-tank-academic"])
        registry[sid] = {
            "name": name,
            "feed_url": url,
            "regions": [region],
            "countries": [country],
            "category": category,
            "source_type": category,
            "ideology": "center",
            "independence": "independent" if category in ("think-tank-academic", "independent-critical") else "mixed",
            "tier": 1 if weight >= 8 else (2 if weight >= 6 else 3),
            "weight": weight,
            "bias": "non-partisan" if category == "think-tank-academic" else "center",
            "credibility_score": round(prior + (0.15 if category == "think-tank-academic" else 0.05), 3),
            "topic_strengths": dict(topics),
        }
        added += 1
        existing_urls[url_key] = sid

    with open(REG, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"\nAdded: {added} | Skipped (dupe URL): {skipped}")
    print(f"Registry: {len(registry)} after")


if __name__ == "__main__":
    main()
