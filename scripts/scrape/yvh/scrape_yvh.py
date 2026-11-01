"""Crawl Yakima Valley Hops' advanced hop products into data/sources/.

The storefront is Shopify, so the catalogue is one JSON feed
(``/products.json?limit=250&page=N``) rather than HTML. Only the advanced
products are kept: the variety catalogue comes from beer-analytics, and malt,
yeast, equipment and merch are out of scope. Each product's description links
the manufacturer's tech data sheet; the URLs are recorded so the curated seed
can cite them, but no PDF is fetched here.

Usage:
  python scrape_yvh.py [--out PATH] [--check]
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://yakimavalleyhops.com"
FEED = f"{BASE_URL}/products.json"
USER_AGENT = (
    "HomebrewResearchBot/1.0 (advanced hop products; Contact: leeb@lee-smith.org)"
)
HEADERS = {"User-Agent": USER_AGENT}
PAGE_LIMIT = 250
MAX_PAGES = 20
THROTTLE_S = 1.2
RETRY_AFTER_S = 30.0

# The store's own types. The variety catalogue stays on beer-analytics.
ADVANCED_TYPES = ("Advanced Hop Products", "Liquid Hop Product", "LUPOMAX")

# Hop-derived processing aids carried under an advanced type: antifoam and a
# haze product. Neither is a hop charge, so neither belongs in the catalogue.
NON_HOP_HANDLES = frozenset({"hopaid-antifoam", "hophaze"})

PDF_PATTERN = re.compile(r'https?://[^"\'\s<>]+\.pdf(?:\?[^"\'\s<>]*)?', re.IGNORECASE)
TAG_STRIP = re.compile(r"<[^>]+>")
SPACE_RUN = re.compile(r"\s+")

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "data" / "sources" / "yvh-products.json"


def strip_html(body: str) -> str:
    """Plain text for the description, so the snapshot diffs on words, not markup."""
    text = TAG_STRIP.sub(" ", body or "")
    return SPACE_RUN.sub(" ", html.unescape(text)).strip()


def spec_sheets(body: str) -> list[str]:
    """Absolute https links to the manufacturer's PDFs, deduplicated in order."""
    sheets: list[str] = []
    for match in PDF_PATTERN.findall(body or ""):
        url = match.replace("http://", "https://")
        if url not in sheets:
            sheets.append(url)
    return sheets


def normalize(product: dict[str, Any]) -> dict[str, Any]:
    handle = product.get("handle") or ""
    body = product.get("body_html") or ""
    return {
        "id": handle,
        "handle": handle,
        "title": product.get("title"),
        "product_type": product.get("product_type"),
        "tags": list(product.get("tags") or []),
        "description": strip_html(body),
        "spec_sheets": spec_sheets(body),
        "url": f"{BASE_URL}/products/{handle}",
    }


def retry_after(response: requests.Response) -> float:
    try:
        return float(response.headers.get("Retry-After", RETRY_AFTER_S))
    except (TypeError, ValueError):
        return RETRY_AFTER_S


def fetch_page(session: requests.Session, page: int) -> list[dict[str, Any]]:
    params = {"limit": PAGE_LIMIT, "page": page}
    response = session.get(FEED, params=params, timeout=30)
    if response.status_code == 429:
        time.sleep(retry_after(response))
        response = session.get(FEED, params=params, timeout=30)
    response.raise_for_status()
    return response.json().get("products", [])


def fetch_catalog(session: requests.Session) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        batch = fetch_page(session, page)
        if not batch:
            break
        products.extend(batch)
        if len(batch) < PAGE_LIMIT:
            break
        time.sleep(THROTTLE_S)
    return products


def select_advanced(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (
            normalize(product)
            for product in products
            if product.get("product_type") in ADVANCED_TYPES
            and product.get("handle") not in NON_HOP_HANDLES
        ),
        key=lambda row: row["id"],
    )


def load_snapshot(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def diff(committed: list[dict[str, Any]], live: list[dict[str, Any]]) -> list[str]:
    old = {row["id"]: row for row in committed}
    new = {row["id"]: row for row in live}
    lines = [f"+ {key}" for key in sorted(new.keys() - old.keys())]
    lines += [f"- {key}" for key in sorted(old.keys() - new.keys())]
    lines += [f"~ {key}" for key in sorted(old.keys() & new.keys()) if old[key] != new[key]]
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="snapshot path")
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare the live feed with the committed snapshot; write nothing",
    )
    args = parser.parse_args(argv)

    session = requests.Session()
    session.headers.update(HEADERS)
    live = select_advanced(fetch_catalog(session))
    if not live:
        print("no advanced products found; refusing to write", file=sys.stderr)
        return 2

    out = Path(args.out)
    if args.check:
        committed = load_snapshot(out)
        changes = diff(committed, live)
        print(f"{len(live)} advanced products; {len(changes)} change(s)")
        for line in changes:
            print(line)
        return 1 if changes else 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(live, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(live)} advanced products to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
