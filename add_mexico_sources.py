"""
Hand-curated set of Mexican / LatAm / US-Mexico border English sources
to merge into sources_v3.json. URLs probed before inclusion. Targets
the gap the user identified: nothing on Mexico-AI, Mexico-climate,
Mexico-tech-regulation, Tijuana, US-Mexico border policy.

Run: python add_mexico_sources.py
"""

from __future__ import annotations
import concurrent.futures
import json
import re
import time
from urllib.parse import urlparse

import requests

REG = "sources_v3.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
TIMEOUT = 6

# Each entry: (name, country, region, category, feed_url, weight)
CANDIDATES = [
    # ── Mexico — English-language news ──
    ("Mexico News Daily", "Mexico", "LATIN-AMERICA", "mainstream",
     "https://mexiconewsdaily.com/feed", 6),
    ("The Mexico Daily Post", "Mexico", "LATIN-AMERICA", "mainstream",
     "https://mexicodailypost.com/feed", 5),
    ("The Yucatan Times", "Mexico", "LATIN-AMERICA", "regional",
     "https://www.theyucatantimes.com/feed", 5),
    ("Mexico Business News", "Mexico", "LATIN-AMERICA", "business",
     "https://mexicobusiness.news/feed", 6),
    ("El Universal English", "Mexico", "LATIN-AMERICA", "mainstream",
     "https://www.eluniversal.com.mx/english/rss.xml", 7),
    ("El Financiero Bloomberg", "Mexico", "LATIN-AMERICA", "business",
     "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss", 7),
    ("Expansion Mexico", "Mexico", "LATIN-AMERICA", "business",
     "https://expansion.mx/rss/all", 6),
    ("Forbes Mexico", "Mexico", "LATIN-AMERICA", "business",
     "https://www.forbes.com.mx/feed", 6),
    ("El Economista Mexico", "Mexico", "LATIN-AMERICA", "business",
     "https://www.eleconomista.com.mx/rss/portada.xml", 6),
    ("Animal Politico", "Mexico", "LATIN-AMERICA", "independent-critical",
     "https://www.animalpolitico.com/feed/", 7),
    ("Aristegui Noticias", "Mexico", "LATIN-AMERICA", "independent-critical",
     "https://aristeguinoticias.com/feed/", 7),
    ("SinEmbargo", "Mexico", "LATIN-AMERICA", "independent-critical",
     "https://www.sinembargo.mx/feed", 6),
    ("Milenio", "Mexico", "LATIN-AMERICA", "mainstream",
     "https://www.milenio.com/rss", 6),
    ("La Jornada", "Mexico", "LATIN-AMERICA", "independent-left",
     "https://www.jornada.com.mx/rss/edicion.xml", 6),
    ("Reforma", "Mexico", "LATIN-AMERICA", "mainstream",
     "https://www.reforma.com/rss/portada.xml", 7),

    # ── Mexican government / official ──
    ("Gobierno de Mexico Press", "Mexico", "LATIN-AMERICA", "government-official",
     "https://www.gob.mx/presidencia/feed.rss", 4),
    ("Secretaria de Relaciones Exteriores", "Mexico", "LATIN-AMERICA", "government-official",
     "https://www.gob.mx/sre/rss", 4),
    ("Banxico Press", "Mexico", "LATIN-AMERICA", "government-official",
     "https://www.banxico.org.mx/rss/avisosalprensa.xml", 4),

    # ── US-Mexico border / Tijuana-relevant ──
    ("San Diego Union-Tribune", "United States", "NORTH-AMERICA", "regional",
     "https://www.sandiegouniontribune.com/feed", 6),
    ("Voice of San Diego", "United States", "NORTH-AMERICA", "independent-critical",
     "https://voiceofsandiego.org/feed", 6),
    ("KPBS San Diego", "United States", "NORTH-AMERICA", "regional",
     "https://www.kpbs.org/feeds/news.rss", 5),
    ("Border Report", "United States", "NORTH-AMERICA", "regional",
     "https://www.borderreport.com/feed/", 5),
    ("Texas Tribune", "United States", "NORTH-AMERICA", "independent-critical",
     "https://www.texastribune.org/feeds/", 6),
    ("Inside Climate News Mexico", "United States", "NORTH-AMERICA", "independent-critical",
     "https://insideclimatenews.org/category/regions/mexico/feed/", 6),

    # ── Other LatAm English ──
    ("Buenos Aires Times", "Argentina", "LATIN-AMERICA", "mainstream",
     "https://www.batimes.com.ar/feed", 6),
    ("The City Paper Bogota", "Colombia", "LATIN-AMERICA", "regional",
     "https://thecitypaperbogota.com/feed/", 5),
    ("The Bogota Post", "Colombia", "LATIN-AMERICA", "regional",
     "https://thebogotapost.com/feed", 5),
    ("Rio Times", "Brazil", "LATIN-AMERICA", "regional",
     "https://www.riotimesonline.com/feed", 5),
    ("Brazil Reports", "Brazil", "LATIN-AMERICA", "regional",
     "https://brazilreports.com/feed", 5),
    ("Americas Quarterly", "Latin America", "LATIN-AMERICA", "think-tank-academic",
     "https://americasquarterly.org/feed", 7),
    ("Latin America Reports", "Latin America", "LATIN-AMERICA", "regional",
     "https://latinamericareports.com/feed", 5),

    # ── LatAm tech / digital-policy ──
    ("DPL News", "Latin America", "LATIN-AMERICA", "business",
     "https://dplnews.com/feed/", 6),
    ("R3D Red en Defensa de Derechos Digitales", "Mexico", "LATIN-AMERICA", "independent-critical",
     "https://r3d.mx/feed/", 6),

    # ── Cross-border / US sources covering LatAm extensively ──
    ("Wilson Center Latin America Program", "United States", "GLOBAL", "think-tank-academic",
     "https://www.wilsoncenter.org/program/latin-american-program/feed", 7),
    ("Council of the Americas AQ Online", "United States", "GLOBAL", "think-tank-academic",
     "https://www.as-coa.org/feed", 7),
    ("Brookings Latin America", "United States", "GLOBAL", "think-tank-academic",
     "https://www.brookings.edu/topic/latin-america-the-caribbean/feed/", 7),
]


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (name or "").strip().lower())
    return s.strip("_")[:64] or "src"


def probe(url: str) -> tuple[bool, str]:
    try:
        r = requests.head(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        ct = (r.headers.get("content-type") or "").lower()
        if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
            return True, f"HEAD {r.status_code} {ct.split(';')[0]}"
        if r.status_code in (403, 405, 501, 999):
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, stream=True)
            ct = (r.headers.get("content-type") or "").lower()
            r.close()
            if r.status_code == 200 and any(k in ct for k in ("xml", "rss", "atom", "html")):
                return True, f"GET {r.status_code} {ct.split(';')[0]}"
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)[:60]}"


# Default topic strengths by source_type (subset relevant to LatAm topics)
DEFAULT_TOPICS = {
    "mainstream":       {"politics_domestic": 0.7, "politics_foreign": 0.6, "business_markets": 0.5, "climate_energy": 0.4, "human_rights_conflict": 0.5, "culture_society": 0.4},
    "business":         {"politics_domestic": 0.5, "business_markets": 0.9, "climate_energy": 0.5, "science_tech": 0.3},
    "regional":         {"politics_domestic": 0.6, "business_markets": 0.4, "human_rights_conflict": 0.5, "culture_society": 0.5},
    "independent-critical": {"politics_domestic": 0.7, "politics_foreign": 0.6, "human_rights_conflict": 0.8, "culture_society": 0.5, "climate_energy": 0.5},
    "independent-left": {"politics_domestic": 0.7, "human_rights_conflict": 0.7, "culture_society": 0.6, "climate_energy": 0.6},
    "think-tank-academic": {"politics_foreign": 0.9, "politics_domestic": 0.7, "business_markets": 0.5, "climate_energy": 0.6, "human_rights_conflict": 0.7},
    "government-official": {"politics_domestic": 0.4, "politics_foreign": 0.4},
}

COUNTRY_PRIOR = {
    "Mexico": 0.45,
    "United States": 0.78,
    "Argentina": 0.65,
    "Brazil": 0.65,
    "Colombia": 0.55,
    "Latin America": 0.60,
}


def main():
    with open(REG, "r", encoding="utf-8") as f:
        registry = json.load(f)
    existing_urls = {meta.get("feed_url", "").lower().strip(): sid for sid, meta in registry.items() if meta.get("feed_url")}
    print(f"Registry: {len(registry)} sources before merge")

    # Probe candidates concurrently
    print(f"Probing {len(CANDIDATES)} candidate URLs...")
    survivors = []
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as ex:
        future_to_c = {ex.submit(probe, c[4]): c for c in CANDIDATES}
        for fut in concurrent.futures.as_completed(future_to_c):
            c = future_to_c[fut]
            ok, reason = fut.result()
            if ok:
                survivors.append(c)
            else:
                print(f"  DROP {c[0]}: {reason}")
    print(f"  done in {time.time()-start:.1f}s — {len(survivors)} survived")

    added = 0
    skipped = 0
    for name, country, region, category, url, weight in survivors:
        url_key = url.lower().strip()
        if url_key in existing_urls:
            skipped += 1
            continue
        sid = slug(name)
        i = 2
        while sid in registry:
            sid = f"{slug(name)}_{i}"; i += 1
        prior = COUNTRY_PRIOR.get(country, 0.55)
        registry[sid] = {
            "name": name,
            "feed_url": url,
            "regions": [region],
            "countries": [country],
            "category": category,
            "source_type": category,
            "ideology": "center",
            "independence": "mixed",
            "tier": 1 if weight >= 7 else (2 if weight >= 5 else 3),
            "weight": weight,
            "bias": "center-left" if category == "independent-left" else ("center" if category != "independent-critical" else "non-partisan"),
            "credibility_score": round(prior + (0.10 if category == "think-tank-academic" else 0.0), 3),
            "topic_strengths": dict(DEFAULT_TOPICS.get(category, DEFAULT_TOPICS["mainstream"])),
        }
        added += 1
        existing_urls[url_key] = sid

    with open(REG, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)

    print(f"\nResult:")
    print(f"  Added: {added} new sources")
    print(f"  Skipped (already in registry): {skipped}")
    print(f"  Registry now: {len(registry)} sources")


if __name__ == "__main__":
    main()
