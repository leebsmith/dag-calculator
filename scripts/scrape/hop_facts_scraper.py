"""Acquire the hop fact envelope: eleven attributes from ten sources.

The maintained acquisition tool, not a one-off probe. It fetches each source,
records every value as printed together with its stated unit and basis, and
emits `data/sources/hop-facts.json`, which `scripts/build-hops-seed.mjs`
consumes. Responses are cached so a rerun does not re-fetch, and each
document's sha256 is recorded beside it.

Sources change: a crop year, a redesigned page, a new sheet in the HPA library.
Refresh by re-running this, never by editing the JSON by hand.

Usage:
  python hop_facts_scraper.py --all --out data/sources/hop-facts.json
  python hop_facts_scraper.py --sources hopsteiner crosby
  python hop_facts_scraper.py --varieties Cascade Citra --out /tmp/x.json
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

import requests

CACHE = Path("/tmp/opencode/hop-facts-cache")
OUT_DEFAULT = Path("/tmp/opencode/hop-facts/pilot.json")

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

PILOT = [
    "Cascade",
    "Citra",
    "Mosaic",
    "Simcoe",
    "Amarillo",
    "Centennial",
    "Chinook",
    "Saaz",
    "Magnum",
    "Hallertau Mittelfrüh",
]

SOUTHERN = [
    "Galaxy",
    "Vic Secret",
    "Enigma",
    "Eclipse",
    "Superdelic",
    "Nelson Sauvin",
    "Motueka",
    "Riwaka",
    "Nectaron",
    "Pacific Jade",
]

CROSBY_SLUGS = {
    "Cascade": "cascade",
    "Citra": "citra",
    "Mosaic": "mosaic",
    "Simcoe": "simcoe",
    "Amarillo": "amarillo",
    "Centennial": "centennial",
    "Chinook": "chinook",
    "Saaz": "czsaaz",
    "Magnum": "magnum",
    "Hallertau Mittelfrüh": "hallertaumittelfruh",
}

BARTH_SLUGS = {
    "Cascade": "cascade",
    "Citra": "citra",
    "Mosaic": "mosaic",
    "Simcoe": "simcoe",
    "Amarillo": "amarillo",
    "Centennial": "centennial",
    "Chinook": "chinook",
    "Saaz": "saazer",
    "Magnum": "hallertauer-magnum",
    "Hallertau Mittelfrüh": "hallertauer-mittelfrueh",
}

HOPSTEINER_ALIASES = {
    "saaz": "saazer",
    "magnum": "hallertauer magnum",
    "hallertau mittelfruh": "hallertauer mittelfrueh",
}


SOURCE_ALIASES = {
    "hallertau blanc": "hallertauer blanc",
    "diamant": "hallertauer diamant",
    "feux coeur": "feux coeur francais",
    "mt rainier": "mount rainier",
    "mount rainier": "mount rainier",
    "red earth": "red earth",
    "willow creek": "willow creek",
}


def norm(name):
    text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), name or "")
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = re.sub(r"['\u2019]", "", text)
    text = re.sub(r"[\u00ae\u2122\u00a9]", "", text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return text.strip()


PERCENT_MASS = ("percent", "of hop mass")
PERCENT_ALPHA = ("percent", "of alpha acids")
PERCENT_OIL = ("percent", "of total oil")


def cache_path(name):
    return CACHE / name


def fetch(url, name, referer=None, force=False, ua=None):
    path = cache_path(name)
    if path.exists() and not force:
        body = path.read_bytes()
    else:
        headers = {"User-Agent": ua or UA}
        if referer:
            headers["Referer"] = referer
        response = requests.get(url, headers=headers, timeout=45)
        if response.status_code == 429:
            time.sleep(20)
            response = requests.get(url, headers=headers, timeout=45)
        response.raise_for_status()
        body = response.content
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        time.sleep(1.5)
    return body, hashlib.sha256(body).hexdigest()


def json_sha(body):
    return json.loads(body)


NUMBER = r"\d+(?:\.\d+)?"


def parse_stated(value, unit):
    text = (value or "").strip()
    if not text:
        return None
    low = text.lower()
    numbers = [float(n) for n in re.findall(NUMBER, low)]
    if not numbers:
        return None
    if low.startswith(("<", "up to")):
        return {"kind": "max", "raw": text, "lo": None, "hi": numbers[0]}
    if low.startswith("~") and len(numbers) == 1:
        return {"kind": "point", "raw": text, "lo": numbers[0], "hi": numbers[0]}
    kind = "point" if len(numbers) == 1 else "range"
    lo, hi = (numbers[0], numbers[0]) if kind == "point" else (min(numbers), max(numbers))
    return {"kind": kind, "raw": text, "lo": lo, "hi": hi}


def normalise(parsed, unit):
    if parsed is None or unit == "unstated":
        return None
    if unit.startswith("ml_per"):
        lo = None if parsed["lo"] is None else round(parsed["lo"], 3)
        hi = round(parsed["hi"], 3)
        return lo if parsed["kind"] == "point" else [lo, hi]
    if unit == "fraction":
        conv = lambda v: None if v is None else round(v, 4)  # noqa: E731
    else:
        conv = lambda v: None if v is None else round(v / 100.0, 4)  # noqa: E731
    lo, hi = conv(parsed["lo"]), conv(parsed["hi"])
    if parsed["kind"] == "point":
        return lo
    return [lo, hi]


def observation(variety_id, source_id, attribute, stated, unit, basis, label, **extra):
    parsed = parse_stated(stated, unit)
    if parsed is None:
        return None
    row = {
        "variety_id": variety_id,
        "source_id": source_id,
        "attribute": attribute,
        "stated_value": parsed["raw"],
        "stated_unit": unit,
        "stated_basis": basis,
        "value_kind": parsed["kind"],
        "normalised": normalise(parsed, unit),
        "source_label": label,
    }
    row.update(extra)
    return row


def match_variety(label, wanted):
    key = norm(label)
    key = SOURCE_ALIASES.get(key, key)
    if key in wanted:
        return wanted[key]
    best = None
    for candidate, name in wanted.items():
        if key == candidate or key.startswith(candidate + " "):
            if best is None or len(candidate) > len(norm(best)):
                best = name
    return best


def page_name(html):
    match = re.search(r"<h1[^>]*>\s*([^<]+?)\s*</h1>", html, re.I | re.S)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else None


def strip_tags(html):
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    )
    return re.sub(r"\s+", " ", text)


def js_objects(literal):
    depth = 0
    start = None
    for i, char in enumerate(literal):
        if char == "{":
            if depth == 0:
                start = i
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start is not None:
                yield literal[start : i + 1]
                start = None


def field_of(obj, key, quoted=True):
    pattern = rf'"{key}":\s*"([^"]*)"' if quoted else rf'"{key}":\s*([\w.\-]+)'
    match = re.search(pattern, obj)
    return match.group(1) if match else None


def probe_hopsteiner(varieties):
    url = "https://hopsteiner.us/variety-data-sheets/?data=1"
    body, digest = fetch(
        url, "hopsteiner_vf.js", referer="https://hopsteiner.us/variety-data-sheets/"
    )
    source = {
        "id": "hopsteiner-vf",
        "url": url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
    }
    text = body.decode("utf-8", "replace")
    head = text[text.index("varieties") :]
    rows = []
    by_name = {}
    for obj in js_objects(head):
        name = field_of(obj, "name")
        if not name:
            continue
        by_name.setdefault(norm(name), obj)
    for name in varieties:
        obj = by_name.get(norm(name)) or by_name.get(HOPSTEINER_ALIASES.get(norm(name), ""))
        if not obj:
            continue
        low = field_of(obj, "acid_alpha_low", quoted=False)
        high = field_of(obj, "acid_alpha_high", quoted=False)
        alpha = f"{low} - {high}" if low and high else None
        rows.append(
            observation(
                name,
                "hopsteiner-vf",
                "alpha",
                alpha,
                "percent",
                PERCENT_MASS[1],
                "acid_alpha_low/high",
            )
        )
        rows.append(
            observation(
                name,
                "hopsteiner-vf",
                "beta",
                field_of(obj, "acid_beta"),
                "percent",
                PERCENT_MASS[1],
                "acid_beta",
            )
        )
        rows.append(
            observation(
                name,
                "hopsteiner-vf",
                "cohumulone",
                field_of(obj, "cohumulone"),
                "percent",
                PERCENT_ALPHA[1],
                "cohumulone",
            )
        )
        rows.append(
            observation(
                name,
                "hopsteiner-vf",
                "total_oil",
                field_of(obj, "oils"),
                "unstated",
                PERCENT_MASS[1],
                "oils",
                unit_inferred=True,
            )
        )
        for key, attribute in (
            ("humulen", "humulene"),
            ("farnesen", "farnesene"),
            ("linalool_oil", "linalool"),
        ):
            stated = field_of(obj, key)
            if not stated:
                continue
            scaled = "fraction" if re.fullmatch(r"0?\.\d+", stated.strip()) else "percent"
            rows.append(
                observation(
                    name,
                    "hopsteiner-vf",
                    attribute,
                    stated,
                    scaled,
                    PERCENT_OIL[1],
                    key,
                    unit_inferred=True,
                )
            )
        source.setdefault("records", name)
    source["varieties"] = len(by_name)
    return source, [r for r in rows if r]


def probe_crosby(varieties):
    index_url = "https://www.crosbyhops.com/hops/varieties/"
    body, digest = fetch(index_url, "crosby_index.html")
    index = body.decode("utf-8", "replace")
    slugs = sorted(set(re.findall(r"/hops/varieties/([a-z0-9\-]+)", index)))
    source = {
        "id": "crosby-variety",
        "url": index_url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
        "varieties": len(slugs),
    }
    wanted = {norm(v): v for v in varieties}
    rows = []
    for slug in slugs:
        url = f"https://www.crosbyhops.com/hops/varieties/{slug}"
        page, _ = fetch(url, f"crosby_{slug}.html")
        html = page.decode("utf-8", "replace")
        name = match_variety(page_name(html) or slug.replace("-", " "), wanted)
        if not name:
            continue
        text = strip_tags(html)
        blocks = len(re.findall(r"Brewing Values", text))
        pairs = [
            (
                "alpha",
                rf"Alpha Acids\s*({NUMBER})\s*-\s*({NUMBER})\s*%",
                "percent",
                PERCENT_MASS[1],
            ),
            ("beta", rf"Beta Acids\s*({NUMBER})\s*-\s*({NUMBER})\s*%", "percent", PERCENT_MASS[1]),
            (
                "cohumulone",
                rf"Cohumulone\s*({NUMBER})\s*-\s*({NUMBER})\s*%",
                "percent",
                PERCENT_ALPHA[1],
            ),
            ("myrcene", rf"Myrcene\s*({NUMBER})\s*-\s*({NUMBER})\s*%", "percent", PERCENT_OIL[1]),
            ("humulene", rf"Humulene\s*({NUMBER})\s*-\s*({NUMBER})\s*%", "percent", PERCENT_OIL[1]),
            (
                "caryophyllene",
                rf"Caryophyllene\s*({NUMBER})\s*-\s*({NUMBER})\s*%",
                "percent",
                PERCENT_OIL[1],
            ),
            (
                "farnesene",
                rf"Farnesene\s*({NUMBER})\s*-\s*({NUMBER})\s*%",
                "percent",
                PERCENT_OIL[1],
            ),
        ]
        for attribute, pattern, unit, basis in pairs:
            match = re.search(pattern, text)
            if match:
                stated = f"{match.group(1)} - {match.group(2)}"
                rows.append(
                    observation(
                        name,
                        "crosby-variety",
                        attribute,
                        stated,
                        unit,
                        basis,
                        attribute.title(),
                        page_url=url,
                        form_blocks=blocks,
                    )
                )
        oil = re.search(
            rf"Total Oils\s*(Up to\s*)?({NUMBER})(?:\s*-\s*({NUMBER}))?\s*ml/100g", text, re.I
        )
        if oil:
            stated = f"up to {oil.group(2)}" if oil.group(1) else f"{oil.group(2)} - {oil.group(3)}"
            rows.append(
                observation(
                    name,
                    "crosby-variety",
                    "total_oil",
                    stated,
                    "ml_per_100g",
                    PERCENT_MASS[1],
                    "Total Oils",
                    page_url=url,
                    form_blocks=blocks,
                )
            )
    return source, [r for r in rows if r]


def probe_barthhaas(varieties):
    base = "https://www.barthhaas.com/hops-and-products/hops/"
    source = {
        "id": "barthhaas-variety",
        "url": base,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": None,
    }
    value = r"(up to\s*[\d.]+|[\d.]+\s*-\s*[\d.]+)"
    variants = {norm(v): v for v in varieties}
    listing, _ = fetch(
        "https://www.barthhaas.com/sitemap.xml?sitemap=pages&cHash=0189c51351eac515d1eff474f507427c",
        "barthhaas_sitemap.xml",
    )
    urls = sorted(
        {
            u
            for u in re.findall(r"<loc>([^<]+)</loc>", listing.decode("utf-8", "replace"))
            if "/hops-and-products/hops/" in u
        }
    )
    labels = [
        ("alpha", rf"ALPHA-ACIDS\*?\s*{value}\s*%", "percent", PERCENT_MASS[1], "ALPHA-ACIDS"),
        ("beta", rf"BETA-ACIDS\s*{value}\s*%", "percent", PERCENT_MASS[1], "BETA-ACIDS"),
        ("myrcene", rf"MYRCENE\s*{value}\s*%", "percent", PERCENT_OIL[1], "MYRCENE"),
        (
            "caryophyllene",
            rf"CARYOPHYLLENE[^|]{{0,32}}?{value}\s*%",
            "percent",
            PERCENT_OIL[1],
            "CARYOPHYLLENE",
        ),
        ("farnesene", rf"FARNESEN[^|]{{0,32}}?{value}\s*%", "percent", PERCENT_OIL[1], "FARNESEN"),
        ("humulene", rf"HUMULENE\s*{value}\s*%", "percent", PERCENT_OIL[1], "HUMULENE"),
    ]
    rows = []
    digests = []
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        try:
            page, digest = fetch(url, f"barth_{slug}.html")
        except requests.HTTPError:
            continue
        html = page.decode("utf-8", "replace")
        name = match_variety(page_name(html) or slug.replace("-", " "), variants)
        if not name:
            continue
        digests.append(digest)
        text = strip_tags(html)
        for attribute, pattern, unit, basis, label in labels:
            match = re.search(pattern, text)
            if match:
                rows.append(
                    observation(
                        name,
                        "barthhaas-variety",
                        attribute,
                        match.group(1),
                        unit,
                        basis,
                        label,
                        page_url=url,
                    )
                )
        oil = re.search(
            r"TOTAL OIL\s*(up to\s*[\d.]+|[\d.]+\s*-\s*[\d.]+)\s*ml/100\s*g", text, re.I
        )
        if oil:
            rows.append(
                observation(
                    name,
                    "barthhaas-variety",
                    "total_oil",
                    oil.group(1),
                    "ml_per_100g",
                    PERCENT_MASS[1],
                    "TOTAL OIL",
                    page_url=url,
                )
            )
    source["sha256"] = digests
    return source, [r for r in rows if r]


def pdf_text(url, name):
    body, digest = fetch(url, name)
    path = cache_path(name)
    text = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True
    ).stdout
    return text, digest


PDF_HEADERS = {"VARIETY", "COHUM", "OILS*", "AROMA"}


def pdf_words(path):
    xml = subprocess.run(
        ["pdftotext", "-layout", "-bbox-layout", str(path), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    out = []
    page = -1
    for element in ET.fromstring(xml).iter():
        name = element.tag.split("}")[-1]
        if name == "page":
            page += 1
        elif name == "word":
            out.append(
                {
                    "page": page,
                    "x": float(element.get("xMin")),
                    "y": float(element.get("yMin")),
                    "t": (element.text or "").strip(),
                }
            )
    return out


def pdf_lines(words, low, high, bottom):
    grouped = {}
    for word in words:
        if low <= word["x"] < high and word["y"] > bottom:
            grouped.setdefault(round(word["y"]), []).append(word)
    lines = []
    for y, row in sorted(grouped.items()):
        row.sort(key=lambda w: w["x"])
        lines.append((y, " ".join(w["t"] for w in row)))
    return lines


def hga_rows(path, varieties):
    words = pdf_words(path)
    pages = {}
    for word in words:
        pages.setdefault(word["page"], []).append(word)
    wanted = {norm(v) for v in varieties}
    rows = []
    for page, page_words in sorted(pages.items()):
        headers = [w for w in page_words if w["t"] in PDF_HEADERS and w["t"].isupper()]
        for variety_header in [w for w in headers if w["t"] == "VARIETY"]:
            same_row = [
                w
                for w in headers
                if abs(w["y"] - variety_header["y"]) < 12 and w["x"] > variety_header["x"]
            ]

            def column_x(token, row=same_row):
                found = [w["x"] for w in row if w["t"] == token]
                return min(found) if found else None

            cohum, oils, aroma = column_x("COHUM"), column_x("OILS*"), column_x("AROMA")
            if cohum is None or oils is None or aroma is None:
                continue
            x = variety_header["x"]
            bottom = variety_header["y"] + 5
            alpha_lines = [
                (y, t) for y, t in pdf_lines(page_words, x - 4, cohum, bottom) if "/" in t
            ]
            beta_lines = [
                (y, t) for y, t in pdf_lines(page_words, x - 4, cohum, bottom) if "%" in t
            ]
            cohum_lines = pdf_lines(page_words, cohum - 2, oils, bottom)
            oil_lines = pdf_lines(page_words, oils - 2, aroma, bottom)
            names = [
                w
                for w in page_words
                if abs(w["x"] - x) <= 9 and w["y"] > bottom and norm(w["t"]) in wanted
            ]
            for y, text in alpha_lines:
                alpha = re.search(rf"({NUMBER})\s*-\s*({NUMBER})\s*/", text)
                if not alpha:
                    continue
                name = min(names, key=lambda w: abs(w["y"] - y), default=None)
                if name is None or abs(name["y"] - y) > 10:
                    continue
                beta = min(((abs(by - y - 9), bt) for by, bt in beta_lines), default=(99, ""))
                coh = min(((abs(by - y - 5), ct) for by, ct in cohum_lines), default=(99, ""))
                oil = min(((abs(by - y - 5), ot) for by, ot in oil_lines), default=(99, ""))
                beta_match = (
                    re.search(rf"({NUMBER})\s*-\s*({NUMBER})\s*%", beta[1])
                    if beta[0] < 12
                    else None
                )
                coh_match = (
                    re.search(rf"({NUMBER})\s*(?:-\s*({NUMBER}))?\s*%", coh[1])
                    if coh[0] < 12
                    else None
                )
                oil_match = (
                    re.search(rf"({NUMBER})\s*-\s*({NUMBER})", oil[1]) if oil[0] < 12 else None
                )
                rows.append(
                    {
                        "page": page + 1,
                        "name": name["t"],
                        "alpha": f"{alpha.group(1)} - {alpha.group(2)}",
                        "beta": f"{beta_match.group(1)} - {beta_match.group(2)}"
                        if beta_match
                        else None,
                        "cohumulone": (
                            f"{coh_match.group(1)} - {coh_match.group(2)}"
                            if coh_match and coh_match.group(2)
                            else (coh_match.group(1) if coh_match else None)
                        ),
                        "total_oil": f"{oil_match.group(1)} - {oil_match.group(2)}"
                        if oil_match
                        else None,
                    }
                )
    return rows


def probe_hga(url, name, source_id, varieties):
    text, digest = pdf_text(url, name)
    source = {
        "id": source_id,
        "url": url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
    }
    rows = []
    canonical = {norm(v): v for v in varieties}
    for row in hga_rows(cache_path(name), varieties):
        page = row["page"]
        variety = canonical.get(norm(row["name"]), row["name"])
        label = "ALPHA/BETA, COHUM, OILS* columns"
        for attribute, key, unit, basis in (
            ("alpha", "alpha", "percent", PERCENT_MASS[1]),
            ("beta", "beta", "percent", PERCENT_MASS[1]),
            ("cohumulone", "cohumulone", "percent", PERCENT_ALPHA[1]),
            ("total_oil", "total_oil", "ml_per_100g", PERCENT_MASS[1]),
        ):
            if not row[key]:
                continue
            rows.append(
                observation(
                    variety,
                    source_id,
                    attribute,
                    row[key],
                    unit,
                    basis,
                    label,
                    page=page,
                )
            )
    return source, [r for r in rows if r]


SHEET_ALIASES = {
    "hallertauer-mittelfruher": "Hallertau Mittelfrüh",
    "hallertauer-magnum": "Magnum",
    "saazer": "Saaz",
    "east-kent-golding": "East Kent Goldings",
    "spalt-spalter": "Spalt Spalter",
    "tettnang-tettnanger": "Tettnang Tettnanger",
    "huell-classic": "Hüll Classic",
    "huell-melon": "Hüll Melon",
    "bru": "BRU-1",
    "idaho7": "Idaho 7",
    "talus": "TALUS",
    "el-dorado": "El Dorado",
    "hbc-1134": "HBC 1134",
    "hbc-472": "HBC 472",
    "hbc-522": "HBC 522",
    "hpa-cascade": "Cascade",
}

SHEET_LABELS = [
    ("ALPHA (%)", "alpha", "percent", PERCENT_MASS[1]),
    ("BETA (%)", "beta", "percent", PERCENT_MASS[1]),
    ("COHUMULONE (% OF ALPHA ACIDS)", "cohumulone", "percent", PERCENT_ALPHA[1]),
    ("TOTAL OIL (ML/100G)", "total_oil", "ml_per_100g", PERCENT_MASS[1]),
    ("MYRCENE (% OF TOTAL OIL)", "myrcene", "percent", PERCENT_OIL[1]),
    ("HUMULENE (% OF TOTAL OIL)", "humulene", "percent", PERCENT_OIL[1]),
    ("CARYOPHYLLENE (% OF TOTAL OIL)", "caryophyllene", "percent", PERCENT_OIL[1]),
    ("FARNESENE (% OF TOTAL OIL)", "farnesene", "percent", PERCENT_OIL[1]),
    ("LINALOOL (% OF TOTAL OIL)", "linalool", "percent", PERCENT_OIL[1]),
    ("ALPHA-ACIDS", "alpha", "percent", PERCENT_MASS[1]),
    ("BETA-ACIDS", "beta", "percent", PERCENT_MASS[1]),
    ("TOTAL OIL", "total_oil", "ml_per_100g", PERCENT_MASS[1]),
    ("MYRCENE", "myrcene", "percent", PERCENT_OIL[1]),
    ("HUMULENE", "humulene", "percent", PERCENT_OIL[1]),
    ("CARYOPHYLLENE", "caryophyllene", "percent", PERCENT_OIL[1]),
    ("FARNESENE", "farnesene", "percent", PERCENT_OIL[1]),
    ("LINALOOL", "linalool", "percent", PERCENT_OIL[1]),
]

VALUE = r"(?:up to\s*)?[<>]?\s*\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?"


def sheet_urls():
    body, _ = fetch("https://hops.com.au/hops/", "hpa_hops.html")
    html = body.decode("utf-8", "replace")
    return sorted(
        set(re.findall(r"https://hops\.com\.au/downloads/data-sheet/[a-z]+/[^\"]+\.pdf", html))
    )


def probe_sheets(source_id, region, varieties):
    wanted = {norm(v) for v in varieties}
    rows = []
    digests = []
    seen = 0
    for url in sheet_urls():
        if f"/data-sheet/{region}/" not in url:
            continue
        stem = url.split("/")[-1].replace("-Data-Sheet.pdf", "")
        name = SHEET_ALIASES.get(stem.lower(), stem.replace("-", " "))
        if norm(name) not in wanted:
            continue
        seen += 1
        body, digest = fetch(url, f"sheet_{stem}.pdf")
        digests.append({"url": url, "sha256": digest})
        path = cache_path(f"sheet_{stem}.pdf")
        text = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True
        ).stdout
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
        for line in lines:
            upper = line.upper()
            for label, attribute, unit, basis in SHEET_LABELS:
                if not upper.startswith(label):
                    continue
                remainder = line[len(label) :]
                match = re.search(VALUE, remainder)
                if not match:
                    break
                rows.append(
                    observation(
                        name,
                        source_id,
                        attribute,
                        match.group(0),
                        unit,
                        basis,
                        label.rstrip("*"),
                        page_url=url,
                    )
                )
                break
    source = {
        "id": source_id,
        "url": "https://hops.com.au/hops/",
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digests,
        "varieties": seen,
    }
    return source, [r for r in rows if r]


def probe_hpa_catalogue(varieties):
    url = "https://hops.com.au/downloads/products/HPA-Product-Catalogue.pdf"
    body, digest = fetch(url, "HPA-Product-Catalogue.pdf")
    path = cache_path("HPA-Product-Catalogue.pdf")
    text = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True
    ).stdout
    wanted = {norm(v): v for v in varieties}
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        match = re.match(
            rf"^([A-Za-z][A-Za-z0-9\u00ae\u2122 .'\-]{{2,30}}?)\s{{2,}}.*?"
            rf"({NUMBER})\s*[–-]\s*({NUMBER})\s+({NUMBER})\s*[–-]\s*({NUMBER})\s*$",
            line.strip(),
        )
        if not match:
            continue
        name = wanted.get(norm(match.group(1).strip()))
        if not name:
            continue
        rows.append(
            observation(
                name,
                "hpa-catalogue",
                "alpha",
                f"{match.group(2)} - {match.group(3)}",
                "percent",
                PERCENT_MASS[1],
                "ALPHA ACID (%) column",
            )
        )
        rows.append(
            observation(
                name,
                "hpa-catalogue",
                "total_oil",
                f"{match.group(4)} - {match.group(5)}",
                "ml_per_100g",
                PERCENT_MASS[1],
                "TOTAL OILS (ML/100G) column",
            )
        )
    source = {
        "id": "hpa-catalogue",
        "url": url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
    }
    return source, [r for r in rows if r]


def probe_nzhops(varieties):
    url = "https://nzhops.co.nz/collections/new-zealand-hops/products.json?limit=250"
    body, digest = fetch(url, "nzhops_products.json", ua="Mozilla/5.0 (research)")
    catalogue = json_sha(body)
    wanted = {norm(v) for v in varieties}
    rows = []
    for product in catalogue.get("products", []):
        name = re.sub(r"[®™]", "", product.get("title", "")).strip()
        if norm(name) not in wanted:
            continue
        prose = strip_tags(product.get("body_html") or "")
        match = re.search(rf"\(({NUMBER})\s*[-–]\s*({NUMBER})\s*%\s*AA\)", prose, re.I)
        if not match:
            continue
        rows.append(
            observation(
                name,
                "nzhops-products",
                "alpha",
                f"{match.group(1)} - {match.group(2)}",
                "percent",
                PERCENT_MASS[1],
                "(X - Y % AA) in the product description",
                crop_years=sorted(
                    {
                        v.get("title", "").split(" / ")[0]
                        for v in product.get("variants", [])
                        if v.get("title")
                    }
                ),
            )
        )
    source = {
        "id": "nzhops-products",
        "url": url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
        "varieties": len(catalogue.get("products", [])),
    }
    return source, [r for r in rows if r]


HOPSLIST_ALIASES = {
    "cascade": "cascade us",
    "amarillo": "amarillo vgxp01",
    "feux coeur francais": "feux coeur",
}

HOPSLIST_ROWS = {
    "alpha acid composition": ("alpha", "percent", PERCENT_MASS[1]),
    "beta acid composition": ("beta", "percent", PERCENT_MASS[1]),
    "co-humulone composition": ("cohumulone", "percent", PERCENT_ALPHA[1]),
    "total oil composition": ("total_oil", "ml_per_100g", PERCENT_MASS[1]),
    "myrcene oil composition": ("myrcene", "percent", PERCENT_OIL[1]),
    "humulene oil composition": ("humulene", "percent", PERCENT_OIL[1]),
    "caryophyllene oil": ("caryophyllene", "percent", PERCENT_OIL[1]),
    "farnesene oil": ("farnesene", "percent", PERCENT_OIL[1]),
}


def hopslist_index():
    body, digest = fetch("https://www.hopslist.com/hops/", "hopslist_index.html")
    html = body.decode("utf-8", "replace")
    pairs = re.findall(
        r'<a[^>]+href="(https://www\.hopslist\.com/hops/[a-z-]+/[a-z0-9-]+/)"[^>]*>(.*?)</a>',
        html,
        re.S,
    )
    index = {}
    for url, text in pairs:
        name = re.sub(r"<[^>]+>", "", text).strip()
        if name:
            index.setdefault(norm(name), url)
    return index, digest


def probe_hopslist(varieties):
    index, digest = hopslist_index()
    rows = []
    for name in varieties:
        key = norm(name)
        key = HOPSLIST_ALIASES.get(key, key)
        url = index.get(key)
        if not url:
            continue
        slug = url.rstrip("/").split("/")[-1]
        body, _ = fetch(url, f"hopslist_{slug}.html")
        html = body.decode("utf-8", "replace")
        for label, value in re.findall(r"<td>([^<]+)</td>\s*<td>([^<]*)</td>", html, re.I):
            key = re.sub(r"\s+", " ", label.replace("\u00a0", " ")).strip().lower()
            field = HOPSLIST_ROWS.get(key)
            if not field:
                continue
            attribute, unit, basis = field
            rows.append(
                observation(
                    name,
                    "hopslist",
                    attribute,
                    value.strip(),
                    unit,
                    basis,
                    label.strip(),
                    page_url=url,
                    basis_tier="aggregator",
                )
            )
    source = {
        "id": "hopslist",
        "url": "https://www.hopslist.com/hops/",
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
        "varieties": len(index),
    }
    return source, [r for r in rows if r]


def probe_usda(varieties):
    url = "https://www.ars.usda.gov/pacific-west-area/corvallis-or/forage-seed-and-cereal-research-unit/people/john-henning/cultindex/"
    body, digest = fetch(url, "usda_cultindex.html")
    html = body.decode("utf-8", "replace")
    pairs = re.findall(
        r'href="([^"]*hopcultivars/(\d+)\.html)"[^>]*>(.*?)</a>', html, re.S | re.I
    )
    index = {}
    for _href, accession, text in pairs:
        name = re.sub(r"<br\s*/?>.*", "", text, flags=re.I | re.S)
        name = re.sub(r"<[^>]+>", "", name).strip()
        if name:
            index.setdefault(norm(name), {"accession": accession, "name": name})
    resolved = {v: index[norm(v)] for v in varieties if norm(v) in index}
    source = {
        "id": "usda-cultivars",
        "url": url,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sha256": digest,
        "varieties": len(index),
        "identity": resolved,
    }
    return source, []


SOURCES = {
    "hopsteiner": lambda v: probe_hopsteiner(v),
    "crosby": lambda v: probe_crosby(v),
    "barthhaas": lambda v: probe_barthhaas(v),
    "hga2020": lambda v: probe_hga(
        "https://www.usahops.org/cabinet/data/HGA_VS_2020.pdf", "HGA_VS_2020.pdf", "hga-2020", v
    ),
    "hga2017": lambda v: probe_hga(
        "https://www.usahops.org/cabinet/data/USAHops_VarietySnapshot_2017_SinglePage.pdf",
        "USAHops_VarietySnapshot_2017_SinglePage.pdf",
        "hga-2017",
        v,
    ),
    "haas": lambda v: probe_sheets("haas-sheet", "america", v),
    "barthhaas-sheet": lambda v: probe_sheets("barthhaas-sheet", "europe", v),
    "hpa": lambda v: probe_hpa_catalogue(v),
    "nzhops": lambda v: probe_nzhops(v),
    "hopslist": lambda v: probe_hopslist(v),
    "usda": lambda v: probe_usda(v),
}


def main():
    parser = argparse.ArgumentParser(description="Probe the vendor fact envelope.")
    parser.add_argument("--sources", nargs="+", default=["all"])
    parser.add_argument("--varieties", nargs="+", default=PILOT)
    parser.add_argument("--all", action="store_true", help="every variety in the hop seed")
    parser.add_argument("--out", default=str(OUT_DEFAULT))
    args = parser.parse_args()

    if args.all:
        seed_path = Path(__file__).resolve().parents[2] / "data" / "seeds" / "hops.json"
        seed = json.loads(seed_path.read_text())
        args.varieties = sorted(row["name"] for row in seed.values())

    wanted = list(SOURCES) if "all" in args.sources else args.sources
    unknown = [s for s in wanted if s not in SOURCES]
    if unknown:
        parser.error(f"unknown source(s): {', '.join(unknown)}")

    sources = {}
    observations = []
    for key in wanted:
        try:
            source, rows = SOURCES[key](args.varieties)
        except Exception as exc:  # noqa: BLE001 - a probe records failures, it does not hide them
            sources[key] = {"id": key, "error": str(exc)}
            print(f"[{key}] failed: {exc}", file=sys.stderr)
            continue
        sources[key] = source
        observations.extend(rows)
        print(f"[{key}] {len(rows)} observations")

    payload = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "pilot": args.varieties,
        "sources": sources,
        "observations": observations,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(observations)} observations to {out}")


if __name__ == "__main__":
    main()
