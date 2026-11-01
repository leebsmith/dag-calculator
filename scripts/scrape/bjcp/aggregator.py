"""Aggregate cached BJCP style-guide HTML into the BJCPStyleTarget JSON shape.

Usage:
  python aggregator.py --dir ~/MyPythonEnvironment/bjcp_scraper/2021 \
      --out data/sources/bjcp_styles_2021.json

The scraper (scrape_bjcp.py) caches one HTML file per category page; this scans
those files for <article class="style"> blocks. Source-faithful extras:
  - `categorynumber` / `category` on every style-level record (from the
    category-header records, e.g. "21 IPA")
  - `source_key` = "<style_id> <style_name>" (stable raw key for duplicates)
The seed-specific id/merge rules live in scripts/build-styles-seed.mjs.
"""

import argparse
import glob
import json
import os
import re

from bs4 import BeautifulSoup


def clean_prose(element):
    if not element:
        return ""
    for header in element.find_all(["h2", "h3"]):
        header.decompose()
    return element.get_text(separator=" ", strip=True)


PROSE_CLASSES = {
    "overall_impression": "overall-impression",
    "appearance": "appearance",
    "aroma": "aroma",
    "flavor": "flavor",
    "mouthfeel": "mouthfeel",
    "comments": "comments",
    "history": "history",
    "characteristic_ingredients": "ingredients",
    "style_comparison": "style-comparison",
}


def _parse_identity(article):
    title_tag = article.find("h1", class_="entry-title")
    if not title_tag:
        return None
    title_match = re.match(r"^([\w\d]+)\.\s*(.*)", title_tag.get_text(strip=True))
    if not title_match:
        return None
    return {
        "style_id": title_match.group(1),
        "style_name": title_match.group(2),
        "version": _parse_version(title_tag),
    }


def _parse_version(title_tag):
    a_tag = title_tag.find("a")
    if not (a_tag and a_tag.has_attr("href")):
        return 2015
    version_match = re.search(r"/style/(\d{4})/", a_tag["href"])
    if not version_match:
        return 2015
    return int(version_match.group(1))


def _parse_prose(article):
    prose = {}
    for schema_key, html_class in PROSE_CLASSES.items():
        div = article.find("div", class_=html_class)
        if div:
            prose[schema_key] = clean_prose(div)
    return prose


def _parse_vitals(article):
    vitals_div = article.find("div", class_="vital-statistics")
    if not vitals_div:
        return {}
    vitals = {}
    for row in vitals_div.find_all("div", class_="row"):
        cells = row.find_all("div", class_="cell")
        if len(cells) != 2:
            continue
        stat_val = cells[1].get_text(strip=True)
        val_match = re.search(r"([\d\.]+)\%?\s*-\s*([\d\.]+)\%?", stat_val)
        if val_match:
            vitals[cells[0].get_text(strip=True).lower()] = {
                "min": float(val_match.group(1)),
                "max": float(val_match.group(2)),
            }
    return vitals


def _parse_examples(article):
    comm_div = article.find("div", class_="commercial-examples")
    if not comm_div:
        return []
    text = clean_prose(comm_div)
    if text.endswith("."):
        text = text[:-1]
    return [ex.strip() for ex in text.split(",") if ex.strip()]


def _parse_attributes(article):
    attr_div = article.find("div", class_="style-attributes")
    if not attr_div:
        return None
    return [t.get_text(strip=True) for t in attr_div.find_all("a", rel="tag")]


def _parse_article(article):
    style_data = _parse_identity(article)
    if style_data is None:
        return None
    style_data.update(_parse_prose(article))
    vitals = _parse_vitals(article)
    if vitals:
        style_data["vital_statistics"] = vitals
    examples = _parse_examples(article)
    if examples:
        style_data["commercial_examples"] = examples
    attributes = _parse_attributes(article)
    if attributes is not None:
        style_data["style_attributes"] = attributes
    return style_data


def parse_bjcp_directory(directory="."):
    parsed_styles = []
    for file_path in glob.glob(os.path.join(directory, "*.html")):
        with open(file_path, encoding="utf-8") as f:
            soup = BeautifulSoup(f, "html.parser")
        for article in soup.find_all("article", class_="style"):
            style_data = _parse_article(article)
            if style_data is not None:
                parsed_styles.append(style_data)
    attach_categories(parsed_styles)
    return parsed_styles


def attach_categories(styles):
    """Add categorynumber/category + source_key to style-level records.

    Category-header records have a bare numeric id (e.g. "21" -> "IPA"); they are
    kept for the normalizer but are not style-level records themselves.
    """
    category_names = {
        style["style_id"]: style["style_name"]
        for style in styles
        if re.fullmatch(r"\d+", style["style_id"])
    }

    for style in styles:
        style_id = style["style_id"]
        if re.fullmatch(r"\d+", style_id):
            continue
        number_match = re.match(r"(\d+)", style_id)
        number = number_match.group(1) if number_match else ""
        style["categorynumber"] = number
        style["category"] = category_names.get(number, "")
        style["source_key"] = f"{style_id} {style['style_name']}"


def main():
    parser = argparse.ArgumentParser(description="Aggregate cached BJCP style-guide HTML.")
    parser.add_argument(
        "--dir",
        default=".",
        help="directory containing the cached category HTML files (default: .)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="output JSON path (default: bjcp_styles_<version>.json in the cwd)",
    )
    args = parser.parse_args()

    extracted_data = parse_bjcp_directory(args.dir)
    if not extracted_data:
        print(f"No style records found under {args.dir}")
        return 1

    versions = {s.get("version") for s in extracted_data}
    versions.discard(None)
    version = max(versions) if versions else "unknown"
    output_filename = args.out or f"bjcp_styles_{version}.json"

    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(extracted_data, f, indent=2, ensure_ascii=False)

    print(f"Extraction complete. {len(extracted_data)} records saved to {output_filename}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
