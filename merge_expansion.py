"""
Merge expansion_sources_verified.json into sources_rebalanced_extended.json
(the live registry the app consumes via source_registry.js).

For each new source:
  - Skip if its URL (or its slug) already exists in the registry.
  - Default credibility_score from category+country prior (cheap heuristic)
    so the new sources participate in the existing ranking pipeline.
  - Default topic_strengths from category (same logic as score_sources.py).
  - Carry over the `weight` value from the expansion file.
  - Add `bias` field — for now mirror `ideology` ('center' if unset).

Also: backfill `weight` and `bias` for every EXISTING source in the
registry so the schema is uniform after the merge. Weight is derived
from tier (1->8, 2->6, 3->4) capped 1..10.
"""

from __future__ import annotations
import json
from pathlib import Path

REG_IN = "sources_rebalanced_extended.json"
EXP_IN = "expansion_sources_verified.json"
TOPIC_IN = "topic_index_verified.json"
REG_OUT = "sources_v2.json"
TOPIC_OUT = "topic_index_v2.json"

# Per-country press-freedom prior (same shape as score_sources.py).
# Subset — defaults to 0.5 for any country not listed.
PRIOR = {
    "Norway": 0.95, "Sweden": 0.92, "Finland": 0.92, "Denmark": 0.92,
    "Netherlands": 0.88, "Ireland": 0.85, "Germany": 0.85, "Switzerland": 0.85,
    "Belgium": 0.82, "Austria": 0.80, "France": 0.78, "United Kingdom": 0.78,
    "UK": 0.78, "Spain": 0.75, "Italy": 0.72, "Portugal": 0.78,
    "Czech Republic": 0.72, "Poland": 0.62,
    "Hungary": 0.55, "Greece": 0.65,
    "United States": 0.78, "US": 0.78, "USA": 0.78,
    "Canada": 0.85, "Mexico": 0.45,
    "Argentina": 0.65, "Chile": 0.75, "Brazil": 0.65, "Uruguay": 0.82,
    "Colombia": 0.55, "Peru": 0.60, "Costa Rica": 0.78,
    "Australia": 0.80, "New Zealand": 0.88,
    "Japan": 0.75, "South Korea": 0.75, "Taiwan": 0.82,
    "China": 0.10, "Hong Kong": 0.40, "North Korea": 0.05,
    "Singapore": 0.55, "Malaysia": 0.50, "Indonesia": 0.55,
    "Thailand": 0.45, "Vietnam": 0.20, "Philippines": 0.50,
    "Cambodia": 0.20, "Myanmar": 0.10, "Laos": 0.15, "Brunei": 0.30,
    "Timor-Leste": 0.55,
    "India": 0.55, "Pakistan": 0.40, "Bangladesh": 0.40, "Sri Lanka": 0.55,
    "Nepal": 0.55, "Afghanistan": 0.20, "Bhutan": 0.55, "Maldives": 0.55,
    "Russia": 0.10, "Ukraine": 0.55, "Belarus": 0.10,
    "Turkey": 0.30, "Israel": 0.62, "Palestine": 0.30,
    "Saudi Arabia": 0.20, "UAE": 0.30, "Qatar": 0.30, "Kuwait": 0.45,
    "Bahrain": 0.25, "Oman": 0.40, "Iran": 0.15, "Iraq": 0.30,
    "Egypt": 0.20, "Jordan": 0.45, "Lebanon": 0.45, "Yemen": 0.20,
    "Syria": 0.10, "Tunisia": 0.55, "Morocco": 0.40, "Algeria": 0.30,
    "Libya": 0.25,
    "South Africa": 0.70, "Nigeria": 0.45, "Kenya": 0.55, "Ghana": 0.60,
    "Ethiopia": 0.35, "Senegal": 0.55, "Tanzania": 0.50, "Uganda": 0.40,
    "Rwanda": 0.30, "Zimbabwe": 0.30, "Sudan": 0.20, "South Sudan": 0.20,
    "Cameroon": 0.30, "DRC": 0.25, "Cote d'Ivoire": 0.45, "Mali": 0.30,
    "Mozambique": 0.40, "Angola": 0.40, "Zambia": 0.50, "Liberia": 0.50,
    "Sierra Leone": 0.50,
    "Fiji": 0.55, "Papua New Guinea": 0.55, "Samoa": 0.55, "Tonga": 0.55,
}

TYPE_BONUS = {
    "think-tank-academic": 0.18,
    "mainstream": 0.08,
    "business": 0.10,
    "independent-critical": 0.05,
    "independent-left": 0.02,
    "independent-right": 0.02,
    "regional": 0.0,
    "government-official": -0.10,
}

# Default topic strengths by source_type (lifted from score_sources.py).
DEFAULT_TOPICS = {
    "mainstream":       {"politics_domestic": 0.7, "politics_foreign": 0.7, "business_markets": 0.5, "science_tech": 0.4, "climate_energy": 0.4, "human_rights_conflict": 0.5, "culture_society": 0.4, "sports": 0.4, "lithium": 0.2, "critical_minerals": 0.2, "energy_transition": 0.3, "archaeology": 0.2, "paleontology": 0.2},
    "business":         {"politics_domestic": 0.5, "politics_foreign": 0.5, "business_markets": 0.9, "science_tech": 0.2, "climate_energy": 0.5, "human_rights_conflict": 0.2, "culture_society": 0.2, "sports": 0.2, "lithium": 0.2, "critical_minerals": 0.2, "energy_transition": 0.2, "archaeology": 0.2, "paleontology": 0.2},
    "think-tank-academic": {"politics_domestic": 0.7, "politics_foreign": 0.9, "business_markets": 0.4, "science_tech": 0.5, "climate_energy": 0.6, "human_rights_conflict": 0.7, "culture_society": 0.5, "sports": 0.1, "lithium": 0.4, "critical_minerals": 0.4, "energy_transition": 0.5, "archaeology": 0.4, "paleontology": 0.4},
    "government-official": {"politics_domestic": 0.4, "politics_foreign": 0.4, "business_markets": 0.2, "science_tech": 0.2, "climate_energy": 0.2, "human_rights_conflict": 0.1, "culture_society": 0.1, "sports": 0.1, "lithium": 0.1, "critical_minerals": 0.1, "energy_transition": 0.1, "archaeology": 0.1, "paleontology": 0.1},
    "independent-left":   {"politics_domestic": 0.6, "politics_foreign": 0.6, "business_markets": 0.3, "science_tech": 0.3, "climate_energy": 0.6, "human_rights_conflict": 0.7, "culture_society": 0.6, "sports": 0.2, "lithium": 0.2, "critical_minerals": 0.2, "energy_transition": 0.4, "archaeology": 0.2, "paleontology": 0.2},
    "independent-right":  {"politics_domestic": 0.6, "politics_foreign": 0.6, "business_markets": 0.4, "science_tech": 0.3, "climate_energy": 0.3, "human_rights_conflict": 0.3, "culture_society": 0.5, "sports": 0.2, "lithium": 0.2, "critical_minerals": 0.2, "energy_transition": 0.2, "archaeology": 0.2, "paleontology": 0.2},
    "independent-critical": {"politics_domestic": 0.7, "politics_foreign": 0.7, "business_markets": 0.4, "science_tech": 0.4, "climate_energy": 0.5, "human_rights_conflict": 0.8, "culture_society": 0.5, "sports": 0.2, "lithium": 0.3, "critical_minerals": 0.3, "energy_transition": 0.4, "archaeology": 0.3, "paleontology": 0.3},
    "regional":         {"politics_domestic": 0.6, "politics_foreign": 0.4, "business_markets": 0.4, "science_tech": 0.3, "climate_energy": 0.4, "human_rights_conflict": 0.4, "culture_society": 0.5, "sports": 0.4, "lithium": 0.2, "critical_minerals": 0.2, "energy_transition": 0.2, "archaeology": 0.3, "paleontology": 0.3},
}


def compute_credibility(country, source_type):
    prior = PRIOR.get(country, 0.5)
    bonus = TYPE_BONUS.get(source_type, 0.0)
    return max(0.0, min(1.0, round(prior + bonus, 3)))


def default_topics(source_type):
    return dict(DEFAULT_TOPICS.get(source_type, DEFAULT_TOPICS["mainstream"]))


def weight_from_tier(tier):
    if isinstance(tier, int):
        return {1: 8, 2: 6, 3: 4}.get(tier, 4)
    return 4


def bias_from_ideology(ideology, source_type):
    """Map our internal `ideology` field to a human bias label.
    Falls back to type for independent-left/right; 'center' otherwise."""
    if ideology and ideology not in ("unknown", ""):
        return ideology
    if source_type == "independent-left":
        return "center-left"
    if source_type == "independent-right":
        return "center-right"
    if source_type == "government-official":
        return "state media"
    return "center"


def main():
    with open(REG_IN, "r", encoding="utf-8") as f:
        registry = json.load(f)
    with open(EXP_IN, "r", encoding="utf-8") as f:
        expansion = json.load(f)
    with open(TOPIC_IN, "r", encoding="utf-8") as f:
        topic_index = json.load(f)

    before = len(registry)
    # Backfill weight + bias on every existing entry so schema is uniform.
    for sid, meta in registry.items():
        if "weight" not in meta:
            meta["weight"] = weight_from_tier(meta.get("tier", 3))
        if "bias" not in meta:
            meta["bias"] = bias_from_ideology(meta.get("ideology"), meta.get("source_type", "mainstream"))

    # Index existing entries by URL to dedupe by URL collision.
    existing_urls = {meta.get("feed_url", "").lower().strip(): sid
                     for sid, meta in registry.items() if meta.get("feed_url")}

    added = 0
    skipped_dupe = 0
    for sid, e in expansion.items():
        url_key = e["feed_url"].lower().strip()
        if url_key in existing_urls:
            # Update weight on the existing entry if the expansion has a stronger one.
            existing_sid = existing_urls[url_key]
            if e.get("weight", 0) > registry[existing_sid].get("weight", 0):
                registry[existing_sid]["weight"] = e["weight"]
            skipped_dupe += 1
            continue
        # New entry. Backfill credibility + topic_strengths so it ranks
        # alongside the existing ones.
        country = (e.get("countries") or ["Unknown"])[0]
        source_type = e.get("source_type") or e.get("category") or "mainstream"
        new_sid = sid
        # Avoid collision with existing slugs
        base = new_sid
        i = 2
        while new_sid in registry:
            new_sid = f"{base}_{i}"
            i += 1
        registry[new_sid] = {
            "name": e["name"],
            "feed_url": e["feed_url"],
            "regions": e["regions"],
            "countries": e["countries"],
            "category": e["category"],
            "source_type": source_type,
            "ideology": "center",
            "independence": "mixed",
            "tier": e.get("tier", 2),
            "weight": e.get("weight", 5),
            "bias": bias_from_ideology(None, source_type),
            "credibility_score": compute_credibility(country, source_type),
            "topic_strengths": default_topics(source_type),
        }
        added += 1
        existing_urls[url_key] = new_sid

    print(f"Registry merge:")
    print(f"  Before: {before}")
    print(f"  Added:  {added}")
    print(f"  Skipped (URL already in registry): {skipped_dupe}")
    print(f"  After:  {len(registry)}")

    with open(REG_OUT, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"  wrote {REG_OUT}")

    # Topic index: keyed by topic, sorted by weight desc.
    n_topic = sum(len(v) for v in topic_index.values())
    with open(TOPIC_OUT, "w", encoding="utf-8") as f:
        json.dump(topic_index, f, ensure_ascii=False, indent=2)
    print(f"  wrote {TOPIC_OUT} ({len(topic_index)} topics, {n_topic} entries)")


if __name__ == "__main__":
    main()
