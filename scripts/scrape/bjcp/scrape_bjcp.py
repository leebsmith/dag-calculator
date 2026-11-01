import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BJCP_URL = "https://www.bjcp.org/beer-styles/beer-style-guidelines/"

# Matches top-level categories and extracts year & name in one pass, e.g.
# https://www.bjcp.org/style/2021/1/standard-american-beer/
# Sub-styles like /2015/1/1A/ are skipped.
CATEGORY_PATTERN = re.compile(r"https://www\.bjcp\.org/style/(\d{4})/\d+/([a-z\-]+)/?")


def _fetch_index(session):
    try:
        response = session.get(BJCP_URL)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Failed to fetch index: {e}")
        return None
    return response.text


def _collect_categories(soup):
    first_article = soup.find('article')
    if not first_article:
        print("No <article> tag found on the main page.")
        return {}

    beers = {}
    for link in first_article.find_all('a'):
        href = link.get('href')
        if not href:
            continue
        match = CATEGORY_PATTERN.search(href)
        if match:
            yr, beer_name = match.groups()
            if href not in beers:
                beers[href] = {"yr": yr, "beer_name": beer_name}
    return beers


def _save_category(session, href, data):
    dir_path = Path(f"./{data['yr']}")
    dir_path.mkdir(parents=True, exist_ok=True)
    full_path = dir_path / f"{data['beer_name']}.html"

    # Resumable: skip a category whose cached page already exists.
    if full_path.exists():
        print(f"Already exists, skipping: {full_path}")
        return

    print(f"Fetching: {data['beer_name']} ({data['yr']})")
    try:
        cat_response = session.get(href)
        cat_response.raise_for_status()
        cat_soup = BeautifulSoup(cat_response.text, 'html.parser')
        article = cat_soup.find('article')
        if article and article.parent:
            full_path.write_text(str(article.parent), encoding="utf-8")
        else:
            print(f"  -> Warning: No article container found for {data['beer_name']}")
    except requests.RequestException as e:
        print(f"  -> Error fetching {href}: {e}")


def main():
    custom_headers = {
        'User-Agent': 'BJCP-Personal-Scrape (+mailto:leeb@lee-smith.org)',
        'From': 'leeb@lee-smith.org'
    }

    # A Session pools HTTP connections across the crawl.
    session = requests.Session()
    session.headers.update(custom_headers)

    index = _fetch_index(session)
    if index is None:
        return

    print("Opened Index")
    beers = _collect_categories(BeautifulSoup(index, 'html.parser'))
    if not beers:
        print("No categories found.")
        return

    print(f"Found {len(beers)} unique categories. Starting scrape...")
    for href, data in beers.items():
        _save_category(session, href, data)
        time.sleep(2)

if __name__ == '__main__':
    sys.exit(main())
