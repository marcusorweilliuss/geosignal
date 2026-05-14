"""
Augment each source in expanded_sources_registry_clean.json with:
  - credibility_score: 0..1 heuristic combining country press-freedom
    prior + source type + independence + tier.
  - topic_strengths:  topic → 0..1 mapping for ranking by query topic.

Input  : expanded_sources_registry_clean.json  (preferred)
         falls back to expanded_sources_registry.json
Output : expanded_sources_with_scores.json
"""

from __future__ import annotations
import json
import math
import os
from collections import defaultdict
from statistics import mean

INPUT_PREFERRED = "expanded_sources_registry_clean.json"
INPUT_FALLBACK = "expanded_sources_registry.json"
OUTPUT = "expanded_sources_with_scores.json"


# ── Step 1: country press-freedom prior ────────────────────────────
# Rough 0..1 scale, higher = better press freedom / more robust media
# environment. Loosely calibrated against RSF + Freedom House. NOT a
# substitute for the real index — just a useful prior when ranking.
DEFAULT_PRESS_PRIOR = 0.6

COUNTRY_PRESS_PRIOR = {
    # Nordics + Switzerland — global top tier
    "Norway": 0.95, "Sweden": 0.92, "Finland": 0.95, "Denmark": 0.92,
    "Iceland": 0.90, "Switzerland": 0.88,
    # Western Europe
    "Germany": 0.82, "France": 0.75, "Netherlands": 0.85,
    "Belgium": 0.80, "Austria": 0.78, "Luxembourg": 0.85,
    "Ireland": 0.82, "United Kingdom": 0.75, "Portugal": 0.78,
    "Spain": 0.72, "Italy": 0.68,
    # Eastern / Central Europe
    "Estonia": 0.85, "Latvia": 0.78, "Lithuania": 0.78,
    "Czechia": 0.78, "Czech Republic": 0.78, "Slovakia": 0.72,
    "Poland": 0.65, "Slovenia": 0.78, "Croatia": 0.70,
    "Hungary": 0.55, "Romania": 0.65, "Bulgaria": 0.55,
    "Greece": 0.55, "Cyprus": 0.72, "Malta": 0.65,
    "Serbia": 0.50, "Albania": 0.55, "North Macedonia": 0.60,
    "Bosnia and Herzegovina": 0.55, "Montenegro": 0.55, "Kosovo": 0.60,
    "Moldova": 0.55, "Moldova, Republic of": 0.55,
    "Ukraine": 0.50,
    # English-speaking
    "United States": 0.72, "United States of America": 0.72,
    "Canada": 0.85, "Australia": 0.78, "New Zealand": 0.88,
    # Latin America
    "Costa Rica": 0.78, "Uruguay": 0.80, "Chile": 0.70,
    "Argentina": 0.62, "Brazil": 0.60, "Mexico": 0.40,
    "Colombia": 0.45, "Peru": 0.55, "Bolivia": 0.55,
    "Venezuela": 0.20, "Ecuador": 0.55, "Paraguay": 0.55,
    "Panama": 0.65, "Dominican Republic": 0.55, "Cuba": 0.15,
    "Haiti": 0.35, "Jamaica": 0.70, "Trinidad and Tobago": 0.70,
    "Honduras": 0.40, "Nicaragua": 0.25, "El Salvador": 0.45,
    "Guatemala": 0.45,
    # Asia
    "Japan": 0.70, "South Korea": 0.72, "Korea, Republic of": 0.72,
    "Taiwan": 0.78, "Mongolia": 0.65,
    "China": 0.10, "North Korea": 0.05,
    "Korea, Democratic People's Republic of": 0.05,
    "Hong Kong": 0.30, "Macao": 0.35,
    # South Asia
    "India": 0.50, "Pakistan": 0.35, "Bangladesh": 0.40,
    "Sri Lanka": 0.50, "Nepal": 0.55, "Bhutan": 0.55,
    "Maldives": 0.55, "Afghanistan": 0.15, "Myanmar": 0.15,
    # Southeast Asia
    "Singapore": 0.50, "Malaysia": 0.50, "Indonesia": 0.55,
    "Thailand": 0.40, "Philippines": 0.50, "Vietnam": 0.20,
    "Cambodia": 0.25, "Laos": 0.15, "Brunei": 0.30,
    "Timor-Leste": 0.60,
    # Middle East / N Africa
    "Israel": 0.65, "Palestine": 0.35, "Lebanon": 0.55,
    "Jordan": 0.40, "Turkey": 0.25, "Türkiye": 0.25,
    "Saudi Arabia": 0.20, "United Arab Emirates": 0.30,
    "Qatar": 0.30, "Bahrain": 0.25, "Kuwait": 0.45,
    "Oman": 0.40, "Yemen": 0.15, "Iraq": 0.30, "Iran": 0.15,
    "Syria": 0.10, "Syrian Arab Republic": 0.10,
    "Egypt": 0.20, "Morocco": 0.45, "Tunisia": 0.55,
    "Algeria": 0.30, "Libya": 0.25,
    # Sub-Saharan Africa
    "South Africa": 0.70, "Namibia": 0.78, "Botswana": 0.72,
    "Ghana": 0.65, "Senegal": 0.65, "Cape Verde": 0.78,
    "Cabo Verde": 0.78, "Mauritius": 0.70, "Liberia": 0.60,
    "Sierra Leone": 0.55, "Kenya": 0.55, "Tanzania": 0.45,
    "Uganda": 0.40, "Rwanda": 0.30, "Burundi": 0.25,
    "Nigeria": 0.45, "Ethiopia": 0.30, "Sudan": 0.20,
    "South Sudan": 0.20, "Somalia": 0.15, "Eritrea": 0.05,
    "Djibouti": 0.30, "Madagascar": 0.45, "Mozambique": 0.40,
    "Zambia": 0.55, "Zimbabwe": 0.30, "Malawi": 0.50,
    "Angola": 0.35, "Congo": 0.30,
    "Democratic Republic of the Congo": 0.25,
    "Congo, The Democratic Republic of the": 0.25,
    "Cameroon": 0.30, "Gabon": 0.35,
    "Equatorial Guinea": 0.10, "Central African Republic": 0.20,
    "Chad": 0.25, "Mali": 0.30, "Niger": 0.30,
    "Burkina Faso": 0.30, "Mauritania": 0.40,
    "Côte d'Ivoire": 0.50, "Ivory Coast": 0.50,
    "Togo": 0.35, "Benin": 0.50,
    "Comoros": 0.45, "Seychelles": 0.65, "Lesotho": 0.55,
    "Eswatini": 0.30, "Swaziland": 0.30, "Gambia": 0.55,
    "Gambia, The": 0.55, "Guinea": 0.35, "Guinea-Bissau": 0.45,
    "São Tomé and Príncipe": 0.65, "Sao Tome and Principe": 0.65,
    # Caucasus + Central Asia
    "Georgia": 0.55, "Armenia": 0.55, "Azerbaijan": 0.20,
    "Kazakhstan": 0.30, "Uzbekistan": 0.20, "Kyrgyzstan": 0.45,
    "Tajikistan": 0.20, "Turkmenistan": 0.05,
    # Russia
    "Russia": 0.15, "Russian Federation": 0.15, "Belarus": 0.10,
    # Oceania
    "Fiji": 0.55, "Papua New Guinea": 0.55, "Samoa": 0.65,
    "Tonga": 0.55, "Vanuatu": 0.60, "Solomon Islands": 0.55,
    "Marshall Islands": 0.65, "Micronesia": 0.65,
    "Palau": 0.65, "Kiribati": 0.55, "Tuvalu": 0.60,
    "Nauru": 0.55,
}


def _press_prior_for(meta: dict) -> float:
    """Take the first country's prior; fall back to DEFAULT_PRESS_PRIOR."""
    countries = meta.get("countries") or []
    if not countries:
        return DEFAULT_PRESS_PRIOR
    return COUNTRY_PRESS_PRIOR.get(countries[0], DEFAULT_PRESS_PRIOR)


# ── Step 2: credibility scoring ────────────────────────────────────

def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def compute_credibility(meta: dict, press_prior: float) -> float:
    score = press_prior

    st = meta.get("source_type", "")
    score += {
        "think_tank": 0.05,
        "mainstream": 0.03,
        "business": 0.02,
        "independent": 0.03,
        "gov": 0.0,
        "regional": 0.0,
    }.get(st, 0.0)

    indep = meta.get("independence", "")
    score += {
        "independent": 0.05,
        "state": -0.05,
        "party": -0.10,
        "mixed": 0.0,
        "unknown": 0.0,
    }.get(indep, 0.0)

    tier = meta.get("tier", 2)
    score += {1: 0.05, 2: 0.0, 3: -0.05}.get(tier, 0.0)

    return clamp(score)


def add_credibility_scores(registry: dict, prior_table: dict,
                           default_press: float = DEFAULT_PRESS_PRIOR) -> None:
    for meta in registry.values():
        prior = _press_prior_for(meta) if prior_table else default_press
        meta["credibility_score"] = round(compute_credibility(meta, prior), 3)


# ── Step 3: topic strengths ────────────────────────────────────────

TOPICS = [
    "politics_domestic", "politics_foreign", "business_markets",
    "science_tech", "climate_energy", "human_rights_conflict",
    "culture_society", "sports",
    # niche
    "lithium", "critical_minerals", "energy_transition",
    "archaeology", "paleontology",
]

# Manual map of topic specialists by source_id. IDs that don't exist
# in the registry are silently skipped (the spec allows for this).
# You'll want to extend this over time — these are just seeds so the
# infrastructure is in place.
TOPIC_SPECIALISTS = {
    # Energy / critical minerals / lithium
    "columbia_energy_policy": {
        "energy_transition": 1.0, "critical_minerals": 1.0,
        "lithium": 1.0, "climate_energy": 0.85,
    },
    "energy_intelligence": {
        "energy_transition": 0.95, "critical_minerals": 0.85,
        "lithium": 0.85, "climate_energy": 0.8,
    },
    "bloomberg_nef": {
        "energy_transition": 0.95, "critical_minerals": 0.9,
        "lithium": 0.9, "climate_energy": 0.85,
    },
    "carbon_brief": {
        "climate_energy": 0.95, "energy_transition": 0.85,
        "science_tech": 0.7,
    },
    "inside_climate_news": {
        "climate_energy": 0.95, "energy_transition": 0.85,
    },
    "e_e_news": {
        "climate_energy": 0.9, "energy_transition": 0.85,
    },
    # Foreign policy / IR think tanks
    "foreign_affairs": {
        "politics_foreign": 0.95, "human_rights_conflict": 0.7,
    },
    "foreign_policy": {
        "politics_foreign": 0.95, "human_rights_conflict": 0.7,
    },
    "war_on_the_rocks": {
        "politics_foreign": 0.9, "human_rights_conflict": 0.85,
    },
    "the_diplomat": {
        "politics_foreign": 0.9, "human_rights_conflict": 0.7,
    },
    "chatham_house": {
        "politics_foreign": 0.95, "climate_energy": 0.7,
    },
    "brookings": {
        "politics_foreign": 0.85, "politics_domestic": 0.85,
    },
    "carnegie_endowment_for_international_peace": {
        "politics_foreign": 0.95, "human_rights_conflict": 0.75,
    },
    "rand": {
        "politics_foreign": 0.85, "science_tech": 0.7,
    },
    "csis": {
        "politics_foreign": 0.9, "human_rights_conflict": 0.75,
    },
    # Business / finance specialists
    "bloomberg_com": {"business_markets": 0.95, "politics_foreign": 0.7},
    "financial_times": {"business_markets": 0.95, "politics_foreign": 0.75},
    "wall_street_journal": {"business_markets": 0.95, "politics_domestic": 0.8},
    "wsj": {"business_markets": 0.95, "politics_domestic": 0.8},
    "the_economist": {"business_markets": 0.85, "politics_foreign": 0.9},
    "reuters": {"business_markets": 0.9, "politics_foreign": 0.9, "politics_domestic": 0.85},
    # Science / tech
    "nature": {"science_tech": 0.95, "climate_energy": 0.8},
    "the_lancet": {"science_tech": 0.95},
    "mit_technology_review": {"science_tech": 0.95},
    "ars_technica": {"science_tech": 0.9},
    "the_information": {"science_tech": 0.85, "business_markets": 0.75},
    "wired": {"science_tech": 0.85, "culture_society": 0.6},
    # Archaeology / paleontology
    "archaeology_magazine": {"archaeology": 1.0, "science_tech": 0.65},
    "smithsonian_magazine": {"archaeology": 0.85, "paleontology": 0.85, "science_tech": 0.7},
    "national_geographic": {"archaeology": 0.85, "paleontology": 0.85, "science_tech": 0.7},
    "science_news": {"science_tech": 0.9, "archaeology": 0.7, "paleontology": 0.7},
    # Human rights / conflict
    "human_rights_watch": {"human_rights_conflict": 0.95},
    "amnesty_international": {"human_rights_conflict": 0.95},
    "international_crisis_group": {"human_rights_conflict": 0.95, "politics_foreign": 0.9},
    "al_jazeera": {"politics_foreign": 0.8, "human_rights_conflict": 0.8},
}


def default_topic_profile(meta: dict) -> dict[str, float]:
    """Baseline 0.2 across all topics, plus type-driven boosts."""
    profile = {t: 0.2 for t in TOPICS}
    st = meta.get("source_type", "")
    if st in ("mainstream", "regional"):
        profile["politics_domestic"] = 0.7
        profile["politics_foreign"] = 0.7
        profile["culture_society"] = 0.7
        profile["business_markets"] = 0.5
        profile["sports"] = 0.5
    elif st == "business":
        profile["business_markets"] = 0.9
        profile["politics_domestic"] = 0.5
        profile["politics_foreign"] = 0.5
        profile["climate_energy"] = 0.5
    elif st == "think_tank":
        profile["politics_foreign"] = 0.8
        profile["human_rights_conflict"] = 0.8
        profile["climate_energy"] = 0.8
        profile["politics_domestic"] = 0.6
        profile["science_tech"] = 0.55
    elif st == "gov":
        profile["politics_domestic"] = 0.7
        profile["politics_foreign"] = 0.7
    elif st == "independent":
        profile["human_rights_conflict"] = 0.8
        profile["politics_domestic"] = 0.6
        profile["politics_foreign"] = 0.6
        profile["culture_society"] = 0.55
    return profile


def add_topic_strengths(registry: dict, topics: list[str],
                        specialists: dict[str, dict[str, float]]) -> None:
    for sid, meta in registry.items():
        profile = default_topic_profile(meta)
        boosts = specialists.get(sid)
        if boosts:
            for topic, val in boosts.items():
                if topic in profile:
                    profile[topic] = max(profile[topic], val)
                else:
                    # extend the profile if the specialist adds a
                    # topic we didn't list — keeps the system flexible
                    profile[topic] = val
        meta["topic_strengths"] = {t: round(v, 3) for t, v in profile.items()}


# ── Step 4: run everything ─────────────────────────────────────────

def main():
    path = INPUT_PREFERRED if os.path.exists(INPUT_PREFERRED) else INPUT_FALLBACK
    print(f"Loading {path}")
    with open(path, "r", encoding="utf-8") as f:
        registry = json.load(f)
    n = len(registry)
    print(f"  {n} sources loaded")

    print("\nStep 2 — adding credibility_score")
    add_credibility_scores(registry, COUNTRY_PRESS_PRIOR)
    scores = [m["credibility_score"] for m in registry.values()]
    print(f"  min  : {min(scores):.3f}")
    print(f"  mean : {mean(scores):.3f}")
    print(f"  max  : {max(scores):.3f}")
    # bucket distribution
    buckets = defaultdict(int)
    for s in scores:
        buckets[f"{int(s * 10) / 10:.1f}"] += 1
    print("  distribution by bucket:")
    for b in sorted(buckets.keys()):
        bar = "#" * min(50, buckets[b])
        print(f"    {b}  {buckets[b]:4d}  {bar}")

    print("\nStep 3 — adding topic_strengths")
    add_topic_strengths(registry, TOPICS, TOPIC_SPECIALISTS)
    specialists_matched = sum(1 for sid in registry if sid in TOPIC_SPECIALISTS)
    print(f"  specialist seeds defined: {len(TOPIC_SPECIALISTS)}")
    print(f"  specialist seeds present in registry: {specialists_matched}")

    print("\nStep 4 — writing output")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"  wrote {OUTPUT}")

    # Example entries — pick a few to display
    print("\nSample entries:")
    sample_ids = [
        "reuters", "times_of_india", "foreign_affairs", "carbon_brief",
        "bloomberg_com", "al_jazeera", "the_economist",
    ]
    found = [sid for sid in sample_ids if sid in registry]
    if not found:
        found = list(registry.keys())[:5]
    for sid in found[:5]:
        e = registry[sid]
        print(f"\n  {sid}  ({e['name']})")
        print(f"    countries={e.get('countries')}  type={e.get('source_type')}  tier={e.get('tier')}")
        print(f"    credibility_score={e['credibility_score']}")
        top = sorted(e["topic_strengths"].items(), key=lambda x: -x[1])[:4]
        print(f"    top topics: " + ", ".join(f"{t}={v}" for t, v in top))

    print("\nDone.")


if __name__ == "__main__":
    main()
