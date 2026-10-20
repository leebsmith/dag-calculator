#!/usr/bin/env python3
"""Propose the malt -> standard-malt crosswalk.

Rule-based: explicit per-slug overrides, then an ordered keyword table, then a
colour-bin for crystal grades. Writes data/sources/malt-standard-crosswalk.json
(a draft) and prints any residual (unmatched) slugs for review. The committed
crosswalk is the source of truth — this script only proposes.

Usage: python3 scripts/propose-malt-standard-crosswalk.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data/seeds/malts.json"
STD = ROOT / "data/sources/standard-malts.json"
OUT = ROOT / "data/sources/malt-standard-crosswalk.json"


def norm(s: str) -> str:
    s = s.replace("\u00ae", "").replace("\u2122", "")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


# Curated per-slug assignments for names the keyword table can't disambiguate.
OVERRIDES = {
    "aroma-100-md": "melanoidin-malt",
    "aroma-150-md": "brown-malt",
    "best-a-xl": "chit-malt",
    "best-ale-malt": "pale-ale-malt",
    "best-caramel-hell": "caramel-10l",
    "best-heidelberg": "pilsner-malt",
    "bow-valley-select-malt": "pale-ale-malt",
    "brewers-barley-flakes": "flaked-barley",
    "brewers-malt": "pale-ale-malt",
    "brewers-malt-flour": "pale-ale-malt",
    "cara-malt": "caramel-10l",
    "caramel-steam-malt": "caramel-30l",
    "coffee-mroost-450-md": "dehusked-light-roasted",
    "crystal-dark": "caramel-100l",
    "crystal-dark-medium": "caramel-80l",
    "crystal-extra-dark": "extra-dark-crystal",
    "crystal-light": "caramel-40l",
    "crystal-malt": "caramel-60l",
    "crystal-medium": "caramel-60l",
    "crystal-red-malt": "extra-dark-crystal",
    "dark-crystal-malt": "caramel-80l",
    "extra-dark-crystal-malt": "caramel-120l",
    "food-grade-malt": "pale-ale-malt",
    "gambrinus-ipa-malt": "pale-ale-malt",
    "heritage-select-malt": "pale-ale-malt",
    "high-enzyme-malt": "distilling-malt",
    "light-crystal": "caramel-40l",
    "low-colour-chocolate-malt": "pale-chocolate",
    "maritime-malt": "pale-ale-malt",
    "medium-crystal": "caramel-60l",
    "new-englander-malt": "pale-ale-malt",
    "non-gn-malt": "pale-ale-malt",
    "ontario-select-malt": "pale-ale-malt",
    "organic-brewers-malt": "pale-ale-malt",
    "organic-cara-md": "caramel-40l",
    "organic-malt": "pale-ale-malt",
    "pale-crystal-malt": "caramel-30l",
    "pale-high-color-malt": "pale-ale-malt",
    "pink-boots-malt": "pale-ale-malt",
    "pure-oregon-malt": "pale-ale-malt",
    "pure-washington-malt": "pale-ale-malt",
    "quebecoise-malt": "pale-ale-malt",
    "scottish-ale-malt": "pale-ale-malt",
    "toll-malt": "pale-ale-malt",
}

# Ordered keyword rules; first normalized-substring match wins. Specific first.
KEYWORDS = [
    # varietals
    ("maris otter", "maris-otter"),
    ("golden promise", "golden-promise"),
    ("chevallier", "chevallier"),
    ("halcyon", "halcyon"),
    ("pearl", "pearl"),
    ("optic", "optic"),
    ("han\u00e1", "hana"), ("hana", "hana"),    # distilling / functional
    ("distilling", "distilling-malt"), ("distillers", "distilling-malt"),
    ("pot still", "distilling-malt"),
    ("whiskey", "distilling-malt"), ("whisky", "distilling-malt"),
    ("high enzyme", "distilling-malt"), ("high-enzyme", "distilling-malt"),
    ("high diastatic", "distilling-malt"), ("diastatic", "distilling-malt"),
    ("acidulated", "acidulated-malt"), ("acid malt", "acidulated-malt"),
    ("chit", "chit-malt"),
    ("dextrin", "dextrin-malt"), ("carapils copper", "caramel-30l"),
    ("carapils", "dextrin-malt"),
    ("carafoam", "dextrin-malt"), ("dextra pils", "dextrin-malt"),
    ("dextra-pils", "dextrin-malt"),
    ("smoked", "smoked-malt"), ("rauch", "smoked-malt"),
    ("peated", "peated-malt"),
    ("red x", "red-color-malt"), ("redx", "red-color-malt"),
    ("special x", "dark-specialty"), ("extra special", "dark-specialty"),
    ("bourbon", "bourbon-malt"),
    ("special roast", "victory-malt"),
    ("mela", "melanoidin-malt"),
    ("imperial", "munich-dark"),
    ("heritage gold", "pale-ale-malt"),
    ("mars", "munich-light"),
    ("blonde roastoat", "toasted-oats"),
    # crystal named (before numeric / generic)
    ("special b", "special-b"),
    ("caramunich", "caramunich"), ("caramel munich", "caramunich"),
    ("caravienne", "caravienne"), ("caramel vienne", "caravienne"),
    ("caraaroma", "caraaroma"), ("cara aroma", "caraaroma"),
    ("caramel aromatic", "caramel-20l"),
    ("caraamber", "caraamber"), ("cara amber", "caraamber"),
    ("caramel amber", "caraamber"),
    ("carared", "carared"), ("cara red", "carared"),
    ("crystal wheat", "crystal-wheat"), ("caracrystal wheat", "crystal-wheat"),
    ("caramel wheat", "crystal-wheat"), ("cara wheat", "crystal-wheat"),
    ("karrewheat", "crystal-wheat"),
    ("crystal rye", "crystal-rye"), ("caramel rye", "crystal-rye"),
    ("red rye crystal", "crystal-rye"),
    ("golden naked oats", "golden-naked-oats"), ("crystal oat", "golden-naked-oats"),
    ("crystal red", "extra-dark-crystal"), ("red crystal", "caramel-150l"),
    ("drc", "caramel-120l"),
    ("carabrown", "carabrown"), ("cara brown", "carabrown"),
    ("caragold", "caragold"), ("cara gold", "caragold"),
    ("caraglow", "caragold"), ("caramalt", "caragold"),
    ("caramel pils", "dextrin-malt"), ("cara pils", "dextrin-malt"),
    ("cara pilsen", "dextrin-malt"), ("cara md pilsen", "dextrin-malt"),
    ("caramel hell", "caramel-10l"),
    # flaked / torrefied / raw (before generic roasted/kilned/base)
    ("flaked spelt", "flaked-spelt"),
    ("flaked quinoa", "flaked-quinoa"),
    ("flaked torrefied barley", "flaked-barley"), ("flaked barley", "flaked-barley"),
    ("barley flakes", "flaked-barley"),
    ("flaked torrefied wheat", "flaked-wheat"), ("flaked wheat", "flaked-wheat"),
    ("red wheat flakes", "flaked-wheat"), ("wheat flakes", "flaked-wheat"),
    ("flaked torrefied oats", "flaked-oats"), ("flaked oats", "flaked-oats"),
    ("oat flakes", "flaked-oats"), ("rolled oats", "flaked-oats"),
    ("flaked rye", "flaked-rye"), ("rye flakes", "flaked-rye"),
    ("flaked torrefied maize", "flaked-maize"), ("flaked maize", "flaked-maize"),
    ("flaked corn", "flaked-maize"), ("corn flakes", "flaked-maize"),
    ("corn grits", "flaked-maize"),
    ("flaked torrefied rice", "flaked-rice"), ("flaked rice", "flaked-rice"),
    ("rice flakes", "flaked-rice"), ("brown rice flakes", "flaked-rice"),
    ("torrefied", "torrefied-grain"), ("torrified", "torrefied-grain"),
    ("rolled barley", "flaked-barley"),
    ("raw barley", "raw-barley"),
    ("raw wheat", "raw-wheat"), ("unmalted wheat", "raw-wheat"),
    ("red wheat raw", "raw-wheat"), ("white wheat raw", "raw-wheat"),
    ("raw rye", "raw-rye"), ("unmalted rye", "raw-rye"), ("rye raw", "raw-rye"),
    ("rice hulls", "rice-hulls"),
    # roasted specific (before generic chocolate/black/brown)
    ("chocolate rye", "chocolate-rye"),
    ("roast rye", "roast-rye"), ("roasted rye", "roast-rye"),
    ("roast wheat", "roast-wheat"), ("roasted wheat", "roast-wheat"),
    ("mroost wheat", "roast-wheat"),
    ("blackprinz", "dehusked-black"),
    ("midnight wheat", "dehusked-black-wheat"),
    ("mroost 1400", "dehusked-black"), ("mroost 900", "dehusked-chocolate"),
    # NOTE: "Mroost NNN" numbers are EBC (Dingemans); "Mroost 900"~340L,
    # "Mroost 1400"~530L are correct here, but "Coffee Mroost 450"~170L is not a
    # 400-450L debittered coffee — it is handled by OVERRIDES above.
    ("coffee mroost", "debittered-coffee-malt"), ("coffee malt", "debittered-coffee-malt"),
    ("debittered", "debittered-coffee-malt"),
    ("pale chocolate", "pale-chocolate"),
    ("chocolate", "chocolate-malt"),
    ("black malt extra", "dehusked-black"),
    ("black", "black-malt"),
    ("roasted barley", "roasted-barley"), ("roast barley", "roasted-barley"),
    ("black barley", "roasted-barley"),
    # kilned
    ("munich dark", "munich-dark"), ("dark munich", "munich-dark"),
    ("munich light", "munich-light"), ("light munich", "munich-light"),
    ("munich", "munich-light"),
    ("vienna", "vienna-malt"),
    ("aromatic", "aromatic-malt"),
    ("melanoidin", "melanoidin-malt"),
    ("amber", "amber-malt"),
    ("brown", "brown-malt"),
    ("biscuit", "biscuit-malt"),
    ("victory", "victory-malt"),
    ("honey", "honey-malt"), ("brumalt", "honey-malt"),
    ("toasted oat", "toasted-oats"), ("toasted wheat", "toasted-wheat"),
    ("toasted rye", "toasted-rye"),
    # base
    ("pilsner", "pilsner-malt"), ("pilsen", "pilsner-malt"), ("pils", "pilsner-malt"),
    ("pale ale", "pale-ale-malt"), ("pale malt", "pale-ale-malt"),
    ("ale malt", "pale-ale-malt"),
    ("2-row", "pale-ale-malt"), ("two row", "pale-ale-malt"),
    ("6-row", "6-row-malt"), ("six row", "6-row-malt"),
    ("lager", "lager-malt"),
    ("mild", "mild-ale-malt"),
    ("dark wheat", "dark-wheat-malt"),
    ("wheat", "wheat-malt"),
    ("rye", "rye-malt"),
    ("oat", "malted-oats"),
    ("spelt", "malted-spelt"),
]


def keyword_match(name: str):
    n = norm(name)
    for pat, std_id in KEYWORDS:
        if pat in n:
            return std_id
    return None


def nearest_grade(color):
    grades = {10: "caramel-10l", 20: "caramel-20l", 30: "caramel-30l", 40: "caramel-40l",
              60: "caramel-60l", 80: "caramel-80l", 90: "caramel-90l", 100: "caramel-100l",
              120: "caramel-120l", 150: "caramel-150l", 200: "extra-dark-crystal"}
    return grades[min(grades, key=lambda g: abs(g - color))]


def main():
    malts = json.loads(SEED.read_text())
    std = json.loads(STD.read_text())
    exact = {}
    for s in std.values():
        exact[norm(s["name"])] = s["id"]
        for a in s["aliases"]:
            exact[norm(a)] = s["id"]

    crosswalk = {}
    residual = []
    for slug, malt in malts.items():
        std_id = OVERRIDES.get(slug)
        if not std_id:
            std_id = exact.get(norm(malt["name"]))
        if not std_id:
            std_id = keyword_match(malt["name"])
        if not std_id and malt["category"] == "CRYSTAL":
            if isinstance(malt["color_lovibond"], (int, float)):
                std_id = nearest_grade(malt["color_lovibond"])
        if std_id:
            crosswalk[slug] = std_id
        else:
            residual.append((slug, malt["name"], malt["maltster"], malt["category"], malt["color_lovibond"]))

    OUT.write_text(json.dumps({k: crosswalk[k] for k in sorted(crosswalk)}, indent=2) + "\n")
    print(f"matched {len(crosswalk)}/{len(malts)}; residual {len(residual)}")
    for slug, name, mst, cat, col in sorted(residual):
        print(f"  UNMATCHED {slug}  {name}  [{mst}] {cat} {col}L")


if __name__ == "__main__":
    main()
