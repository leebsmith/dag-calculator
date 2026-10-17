"""Scrape beer-analytics.com hop profiles into BeerAnalyticsHopDetail records.

Crawl the /hops/ index for hop detail URLs, then parse each detail page into the
schema-shaped dict (see the project's BeerAnalyticsHopDetail JSON schema).

Usage:
  python hop_scraper.py                    # crawl all hops
  python hop_scraper.py --limit 25         # trial run: first 25 hops
  python hop_scraper.py --out /tmp/h.json  # override the output path

Polite by design: identifies the operator in the User-Agent and throttles between
requests. Output defaults to data/sources/beer-analytics-hops.json in the repo.
"""

import argparse
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.beer-analytics.com"
INDEX_URL = f"{BASE_URL}/hops/"
# scripts/scrape/hop_scraper.py -> <repo>/data/sources/beer-analytics-hops.json
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "data" / "sources" / "beer-analytics-hops.json"

# Identify the operator and the purpose. Keep this in sync with yeast_scraper.py.
HEADERS = {
    "User-Agent": "HomebrewResearchBot/1.0 (hops; Contact: leeb@lee-smith.org)"
}

# Only these /hops/<category>/<slug>/ paths are individual hop profiles.
HOP_CATEGORIES = {"aroma", "bittering", "dual-purpose"}

# Characteristic card header -> schema range key.
CHARACTERISTIC_KEYS = {
    "alpha acid": "alpha_acid_range",
    "beta acid": "beta_acid_range",
    "amount": "amount_range",
}

NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")

THROTTLE_SECONDS = 1.5


def get_soup(url):
    response = requests.get(url, headers=HEADERS)
    if response.status_code != 200:
        raise requests.HTTPError(f"status {response.status_code}")
    return BeautifulSoup(response.text, "html.parser")


def discover_hop_links(soup):
    """Return ordered, de-duplicated hop detail paths from the index page."""
    links = []
    seen = set()
    for a in soup.select("ul.column-list li a[href]"):
        href = a["href"]
        parts = [p for p in href.split("/") if p]
        if (
            href.startswith("/hops/")
            and len(parts) >= 3
            and parts[1] in HOP_CATEGORIES
            and href not in seen
        ):
            seen.add(href)
            links.append(href)
    return links


def clean_origin(value):
    """Strip a leading flag emoji (and its spacing) from an origin string."""
    return re.sub(r"^[^A-Za-z0-9]+", "", value).strip()


def clean_inline_text(value):
    """Repair spacing left by joining inline tags (e.g. 'kölsch ,' -> 'kölsch,')."""
    value = re.sub(r"\s+([,.;:!?%)\]])", r"\1", value)
    value = re.sub(r"([(\[])\s+", r"\1", value)
    return re.sub(r"\s{2,}", " ", value).strip()


def parse_detail_info(detail_soup, hop):
    """Read the <dl class="detail-info"> key/value pairs into the hop record."""
    dl = detail_soup.find("dl", class_="detail-info")
    if not dl:
        return
    for dt in dl.find_all("dt"):
        key = dt.get_text(strip=True).rstrip(":").strip().lower()
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        value = dd.get_text(" ", strip=True)
        if key == "recipes":
            digits = re.sub(r"[^0-9]", "", value)
            if digits:
                hop["recipes_count"] = int(digits)
        elif key == "purpose":
            if value:
                hop["purpose"] = value
        elif key == "alpha":
            if value:
                hop["alpha_rating"] = value
        elif key == "origin":
            cleaned = clean_origin(value)
            if cleaned:
                hop["origin"] = cleaned


def parse_synonym(detail_soup, hop):
    """Read the 'Also known as:' alias line (header p.detail-alias)."""
    alias = detail_soup.select_one("header p.detail-alias")
    if not alias:
        return
    aliases = [em.get_text(strip=True) for em in alias.find_all("em")]
    aliases = [a for a in aliases if a]
    if aliases:
        hop["hop_synonym"] = ", ".join(aliases)
        return
    text = re.sub(r"^also known as\s*:?\s*", "", alias.get_text(" ", strip=True), flags=re.I)
    if text:
        hop["hop_synonym"] = text


def parse_badges(detail_soup, hop):
    """Read the Substitutes/Pairings/Flavor badge figures."""
    for fig in detail_soup.select("figure.badge-list"):
        caption = fig.find("figcaption")
        label = caption.get_text(" ", strip=True).lower() if caption else ""
        if label.startswith("pairing"):
            values = [a.get_text(strip=True) for a in fig.select("ol a")]
            if values:
                hop["pairings"] = values
        elif label.startswith("flavor"):
            values = [a.get_text(strip=True) for a in fig.select("ul a")]
            if values:
                hop["flavor_profiles"] = values


def parse_characteristics(detail_soup, hop):
    """Parse the alpha/beta/amount range cards into nested range objects."""
    ranges = {}
    for card in detail_soup.select("#characteristics div.card"):
        header = card.select_one(".card-header h3")
        body = card.select_one(".card-body")
        if not header or not body:
            continue
        key = CHARACTERISTIC_KEYS.get(header.get_text(" ", strip=True).lower())
        if not key:
            continue

        numbers = [float(n) for n in NUMBER_RE.findall(body.get_text(" ", strip=True))]
        result = {}
        if numbers:
            result["min"] = min(numbers)
            result["max"] = max(numbers)
        strong = body.find("strong")
        if strong:
            match = NUMBER_RE.search(strong.get_text())
            if match:
                result["median"] = float(match.group())
        small = body.find("small")
        if small:
            unit = small.get_text(strip=True)
            if unit:
                result["unit"] = unit
        if result:
            ranges[key] = result

    if ranges:
        hop["characteristics"] = ranges


def parse_hop(url):
    """Parse one hop detail page into a schema-shaped dict."""
    detail_soup = get_soup(url)
    hop = {}

    active_crumb = detail_soup.select_one("ol.breadcrumb li.breadcrumb-item.active")
    if active_crumb:
        hop["hop_name"] = active_crumb.get_text(strip=True)
    else:
        h1 = detail_soup.find("h1")
        if h1:
            hop["hop_name"] = re.sub(r"\s+Hops$", "", h1.get_text(strip=True))

    parse_synonym(detail_soup, hop)

    crumbs = detail_soup.select("ol.breadcrumb li.breadcrumb-item a")
    if len(crumbs) >= 2:
        hop["breadcrumb_category"] = crumbs[1].get_text(strip=True)

    parse_detail_info(detail_soup, hop)
    # `origin` is required by the schema; a few pages omit it on the site.
    hop.setdefault("origin", "Unknown")
    parse_badges(detail_soup, hop)

    description = detail_soup.select_one("div.detail-long-description")
    if description:
        paragraphs = [
            clean_inline_text(p.get_text(" ", strip=True)) for p in description.find_all("p")
        ]
        text = "\n\n".join(p for p in paragraphs if p)
        if text:
            hop["profile_description"] = text

    parse_characteristics(detail_soup, hop)
    return hop


def main():
    parser = argparse.ArgumentParser(description="Scrape beer-analytics.com hop profiles.")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="optional maximum number of hops to crawl (default: all)",
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUTPUT),
        help="output path (default: data/sources/beer-analytics-hops.json)",
    )
    args = parser.parse_args()

    print("Fetching hop index page...")
    index_soup = get_soup(INDEX_URL)
    links = discover_hop_links(index_soup)
    print(f"Found {len(links)} hop profiles.")

    if args.limit and args.limit > 0:
        links = links[: args.limit]
        print(f"Trial run: crawling the first {len(links)} hops.\n")
    else:
        print(f"Crawling all {len(links)} hops.\n")

    hops = []
    errors = 0
    for i, relative_url in enumerate(links, start=1):
        full_url = urljoin(BASE_URL, relative_url)
        try:
            hop = parse_hop(full_url)
            if not hop.get("hop_name"):
                print(f"[{i}/{len(links)}] Skipped (no hop name): {full_url}")
                continue
            hops.append(hop)
            print(f"[{i}/{len(links)}] Scraped: {hop['hop_name']}")
        except Exception as exc:  # noqa: BLE001 - keep crawling on per-page failures
            errors += 1
            print(f"[{i}/{len(links)}] Error on {full_url}: {exc}")

        time.sleep(THROTTLE_SECONDS)

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(hops, f, indent=2, ensure_ascii=False)

    print("\n--- Crawl Complete ---")
    print(f"Saved {len(hops)} hops to {output_path}")
    if errors:
        print(f"Encountered {errors} error(s).")


if __name__ == "__main__":
    main()
