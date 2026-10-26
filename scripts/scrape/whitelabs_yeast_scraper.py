#!/usr/bin/env python3
"""Scrape White Labs' yeast bank into a pinned vendor source.

Output: data/sources/whitelabs-yeasts.json — an envelope with one entry per
strain, carrying the vendor's attenuation range, STA1 QC result, and the hash
of the page it was read from. The seed builder does not consume this file yet
(that is D4b); it exists so the range and STA1 contract has a cited source.

Usage:
    python scripts/scrape/whitelabs_yeast_scraper.py [--limit N] [--out PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.whitelabs.com"
BANK_URL = f"{BASE_URL}/yeast-bank"
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[2] / "data" / "sources" / "whitelabs-yeasts.json"
)
SCHEMA_VERSION = 1

HEADERS = {
    "User-Agent": (
        "HomebrewResearchBot/1.0 (yeast vendor contract; "
        "Contact: leeb@lee-smith.org)"
    )
}

PERCENT = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%?")
TEMPERATURE = re.compile(
    r"([0-9]+)\s*°?\s*[Ff]?\s*[-–]\s*([0-9]+)\s*°?\s*[Ff].*?"
    r"([0-9]+)\s*°\s*[-–]\s*([0-9]+)\s*°?\s*[Cc]"
)
STRAIN = re.compile(r"^([A-Z]+[0-9]+[A-Z0-9]*)\s+(.*)$")


def _clean(value: str) -> str:
    return " ".join(value.replace("\u00ae", "").replace("\u2122", "").split())


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def bank_links(session: requests.Session, limit: int | None) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    page = 1
    while True:
        url = BANK_URL if page == 1 else f"{BANK_URL}?page={page}"
        response = session.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        found = 0
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"].replace("&amp;", "&")
            if "/yeast-single?id=" not in href:
                continue
            href = href.split("&page=")[0]
            if href in seen:
                continue
            seen.add(href)
            links.append(href)
            found += 1
            if limit and len(links) >= limit:
                return links
        if found == 0:
            break
        page += 1
        if page > 30:
            break
        time.sleep(0.75)
    return links


def parse_page(url: str, raw: bytes, retrieved_at: str) -> dict:
    soup = BeautifulSoup(raw, "html.parser")

    title = soup.find("h1")
    title_text = _clean(title.get_text(" ", strip=True)) if title else ""
    strain_match = STRAIN.match(title_text)
    strain = strain_match.group(1) if strain_match else None
    name = _clean(strain_match.group(2)) if strain_match else title_text

    specs: dict[str, str] = {}
    for heading in soup.find_all("h2", class_="table-title"):
        label = _clean(heading.get_text(" ", strip=True)).rstrip(":").strip().upper()
        value = heading.find_next_sibling("p")
        specs[label] = _clean(value.get_text(" ", strip=True)) if value else ""

    attenuation_text = specs.get("ATTENUATION", "")
    numbers = [float(match) for match in PERCENT.findall(attenuation_text)]
    attenuation_low = numbers[0] if numbers else None
    attenuation_high = numbers[-1] if numbers else None

    sta1_text = specs.get("STA1", "")
    sta1_lower = sta1_text.lower()
    if "positive" in sta1_lower:
        sta1 = True
    elif "negative" in sta1_lower:
        sta1 = False
    else:
        sta1 = None

    temp_low_c = temp_high_c = None
    temp_match = TEMPERATURE.search(specs.get("FERMENTATION TEMPERATURE", ""))
    if temp_match:
        temp_low_c = float(temp_match.group(3))
        temp_high_c = float(temp_match.group(4))

    return {
        "url": url,
        "strain": strain,
        "name": name,
        "attenuation_text": attenuation_text,
        "attenuation_low_pct": attenuation_low,
        "attenuation_high_pct": attenuation_high,
        "attenuation_basis": "apparent",
        "flocculation": specs.get("FLOCCULATION", ""),
        "alcohol_tolerance": specs.get("ALCOHOL TOLERANCE", ""),
        "temp_low_c": temp_low_c,
        "temp_high_c": temp_high_c,
        "sta1_text": sta1_text,
        "sta1": sta1,
        "retrieved_at": retrieved_at,
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape White Labs yeast bank.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--delay", type=float, default=0.75)
    args = parser.parse_args()

    session = requests.Session()
    links = bank_links(session, args.limit)
    if not links:
        print("no yeast links found on the bank page", file=sys.stderr)
        return 1

    entries = []
    skipped = 0
    for index, url in enumerate(links, start=1):
        try:
            response = session.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
        except requests.RequestException as exc:
            print(f"[{index}/{len(links)}] skipped {url}: {exc}", file=sys.stderr)
            continue
        entry = parse_page(url, response.content, _now())
        # The bank also lists bacteria, Brett blends, and sourdough cultures;
        # they publish no attenuation range and are outside this contract.
        if entry["strain"] is None or entry["attenuation_low_pct"] is None:
            skipped += 1
            print(f"[{index}/{len(links)}] skipped {entry['name']} (no strain/range)")
            time.sleep(args.delay)
            continue
        entries.append(entry)
        print(f"[{index}/{len(links)}] {entry['strain']} {entry['name']}")
        time.sleep(args.delay)

    payload = {
        "schema_version": SCHEMA_VERSION,
        "source": "White Labs",
        "upstream": BANK_URL,
        "generated_at": _now(),
        "entries": entries,
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(entries)} strains -> {output} ({skipped} non-attenuation rows skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
