#!/usr/bin/env python3
"""Vendor + extend the standard-malt list into data/sources/standard-malts.json.

Reads the canonical `standard_malts.tsv` (from the malt_database repo), appends
the curated extension entries (gap categories our catalog has but the tsv
lacks), and writes an id-keyed JSON the seed builder consumes. One-time vendor
step — the committed JSON is the source of truth; provenance lives in the
sources manifest.

Usage: python3 scripts/vendor-standard-malts.py [path/to/standard_malts.tsv]
"""

import csv
import io
import json
import re
import sys
from pathlib import Path

DEFAULT_TSV = Path.home() / "Development/malt_database/config/standard_malts.tsv"
OUT = Path(__file__).resolve().parent.parent / "data/sources/standard-malts.json"


def slugify(value: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("utf-8")
    text = text.lower().replace("\u00ae", "").replace("\u2122", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def entry_from_tsv(row):
    name = row["name"]
    aliases = [a.strip() for a in re.split(r",\s*", row["aliases"]) if a.strip()]
    return {
        "id": slugify(name),
        "name": name,
        "family": row["family"],
        "form": row["form"],
        "color_lovibond_min": float(row["color_lovibond_min"]),
        "color_lovibond_max": float(row["color_lovibond_max"]),
        "aliases": aliases,
        "description": row["notes"],
    }


# Curated gap entries (one per materially-distinct brewing class). Fields match
# entry_from_tsv. `aliases` feed the crosswalk proposal.
EXTENSIONS = [
    # Heritage/varietal base malts (per-varietal)
    dict(name="Maris Otter", family="base", form="malted", color_lovibond_min=2.5, color_lovibond_max=3.5,
         aliases=["Maris Otter", "Maris Otter Malt", "Low Colour Maris Otter"],
         description="Nutty, biscuity British winter barley; classic English ales and bitters."),
    dict(name="Golden Promise", family="base", form="malted", color_lovibond_min=2.0, color_lovibond_max=3.0,
         aliases=["Golden Promise", "Golden Promise Malt"],
         description="Soft, sweet, honeyed Scottish spring barley; Scotch ales and hazy IPAs."),
    dict(name="Chevallier", family="base", form="malted", color_lovibond_min=3.0, color_lovibond_max=4.0,
         aliases=["Chevallier", "Chevallier Heritage", "Chevallier Malt"],
         description="Victorian landrace; toffee, baked loaf, dried fruit."),
    dict(name="Halcyon", family="base", form="malted", color_lovibond_min=2.5, color_lovibond_max=3.5,
         aliases=["Halcyon", "Halcyon Malt"],
         description="Bright, crisp British winter barley."),
    dict(name="Pearl", family="base", form="malted", color_lovibond_min=2.5, color_lovibond_max=3.5,
         aliases=["Pearl", "Pearl Malt"],
         description="Clean, neutral British winter barley."),
    dict(name="Optic", family="base", form="malted", color_lovibond_min=2.0, color_lovibond_max=3.0,
         aliases=["Optic", "Optic Malt"],
         description="High-extract mellow spring barley."),
    dict(name="Haná", family="base", form="malted", color_lovibond_min=1.5, color_lovibond_max=2.0,
         aliases=["Haná", "Hana", "Haná Heritage", "Haná Malt"],
         description="Moravian landrace; delicate bready pilsner malt for decoction."),
    dict(name="Spring", family="base", form="malted", color_lovibond_min=1.5, color_lovibond_max=2.5,
         aliases=["Spring", "Spring Malt"],
         description="Contemporary high-extract spring two-row."),

    # Distilling / whisky
    dict(name="Distilling Malt", family="base", form="malted", color_lovibond_min=1.5, color_lovibond_max=2.5,
         aliases=["Distilling", "Distillers", "Pot Still", "Whiskey Malt", "Whisky Malt",
                  "High Enzyme", "High-Enzyme", "High Diastatic", "High Diastatic Power", "HDP"],
         description="High-enzyme, high-spirit-yield malt for whisky and neutral spirits."),

    # Specialty crystal
    dict(name="CaraBrown", family="crystal", form="malted", color_lovibond_min=55.0, color_lovibond_max=65.0,
         aliases=["CaraBrown", "Cara Brown", "Carabrown"],
         description="Brown crystal; toffee and dark caramel."),
    dict(name="CaraGold", family="crystal", form="malted", color_lovibond_min=5.0, color_lovibond_max=12.0,
         aliases=["CaraGold", "Cara Gold", "CaraGlow", "Caramalt", "Cara Gold Malt"],
         description="Very light crystal; gentle sweetness, golden colour."),
    dict(name="Caramel 90L", family="crystal", form="malted", color_lovibond_min=85.0, color_lovibond_max=95.0,
         aliases=["Caramel 90L", "Caramel 90", "Crystal 90L", "Cara 90"],
         description="Deep caramel."),

    # Red / kilned specialty
    dict(name="Red Color Malt", family="kilned", form="malted", color_lovibond_min=12.0, color_lovibond_max=25.0,
         aliases=["Red X", "RedX", "Special Red", "Best Red X"],
         description="Red colour contribution with malty body."),
    dict(name="Dark Specialty", family="kilned", form="malted", color_lovibond_min=120.0, color_lovibond_max=140.0,
         aliases=["Special X", "Extra Special Malt", "Extra Special"],
         description="Deep amber-red specialty; toast, dark caramel."),
    dict(name="Bourbon Malt", family="kilned", form="malted", color_lovibond_min=2.0, color_lovibond_max=5.0,
         aliases=["Bourbon Malt", "Bourbon"],
         description="Kilned bourbon malt; caramel, vanilla, oak."),

    # Roasted rye / wheat
    dict(name="Chocolate Rye", family="roasted", form="malted", color_lovibond_min=100.0, color_lovibond_max=350.0,
         aliases=["Chocolate Rye"],
         description="Roasted rye; chocolate, spice."),
    dict(name="Roast Rye", family="roasted", form="malted", color_lovibond_min=200.0, color_lovibond_max=300.0,
         aliases=["Roast Rye", "Roasted Rye"],
         description="Roasted rye; dry, toasty."),
    dict(name="Roast Wheat", family="roasted", form="malted", color_lovibond_min=2.0, color_lovibond_max=350.0,
         aliases=["Roast Wheat", "Roasted Wheat", "Mroost Wheat"],
         description="Roasted wheat; roast notes, dark colour."),

    # Extra flakes / torrefied / raw
    dict(name="Flaked Spelt", family="flaked", form="flaked", color_lovibond_min=1.5, color_lovibond_max=2.5,
         aliases=["Flaked Spelt"],
         description="Flaked spelt; body and haze."),
    dict(name="Flaked Quinoa", family="flaked", form="flaked", color_lovibond_min=1.5, color_lovibond_max=2.5,
         aliases=["Flaked Quinoa"],
         description="Flaked quinoa; body, gluten-free."),
    dict(name="Torrefied Grain", family="raw", form="torrefied", color_lovibond_min=1.0, color_lovibond_max=2.5,
         aliases=["Torrefied Barley", "Torrefied Maize", "Torrefied Rice", "Torrefied Oats",
                  "Flaked Torrefied Barley", "Flaked Torrefied Maize", "Flaked Torrefied Rice",
                  "Flaked Torrefied Oats", "Torrified Wheat", "Torrefied Wheat"],
         description="Torrefied cereal; body and head retention."),
    dict(name="Raw Barley", family="raw", form="raw", color_lovibond_min=1.5, color_lovibond_max=2.5,
         aliases=["Raw Barley"],
         description="Unmalted barley; body, head retention."),
]

# Post-load colour-range overrides for tsv entries whose "typical" range is too
# narrow for the actual products (e.g. roasted barley runs 300-600 L, not 300-350).
RANGE_OVERRIDES = {
    "roasted-barley": (300.0, 600.0),
}


def main():
    tsv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TSV
    rows = list(csv.DictReader(io.StringIO(tsv_path.read_text()), delimiter="\t"))
    entries = {}
    for row in rows:
        e = entry_from_tsv(row)
        entries[e["id"]] = e
    for ext in EXTENSIONS:
        e = {
            "id": slugify(ext["name"]),
            **ext,
            "aliases": ext["aliases"],
        }
        entries[e["id"]] = e
    for eid, (lo, hi) in RANGE_OVERRIDES.items():
        if eid in entries:
            entries[eid]["color_lovibond_min"] = lo
            entries[eid]["color_lovibond_max"] = hi

    ordered = {k: entries[k] for k in sorted(entries)}
    OUT.write_text(json.dumps(ordered, indent=2) + "\n")
    print(f"wrote {len(ordered)} standard malts to {OUT}")


if __name__ == "__main__":
    main()
