import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BJCP_URL = "https://www.bjcp.org/beer-styles/beer-style-guidelines/"

def main():
    custom_headers = {
        'User-Agent': 'BJCP-Personal-Scrape (+mailto:leeb@lee-smith.org)',
        'From': 'leeb@lee-smith.org'  # Optional, but good practice
    }

    # 1. Use a Session to pool HTTP connections (faster and more efficient)
    session = requests.Session()
    session.headers.update(custom_headers)

    try:
        response = session.get(BJCP_URL)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Failed to fetch index: {e}")
        return

    print("Opened Index")
    soup = BeautifulSoup(response.text, 'html.parser')
    first_article = soup.find('article')

    if not first_article:
        print("No <article> tag found on the main page.")
        return

    # 2. Combined Regex: Matches top-level categories AND extracts year & name in one pass.
    # Matches: https://www.bjcp.org/style/2021/1/standard-american-beer/
    # Skips sub-styles like /2015/1/1A/
    category_pattern = re.compile(r"https://www\.bjcp\.org/style/(\d{4})/\d+/([a-z\-]+)/?")

    beers = {}

    # Extract links and deduplicate them simultaneously
    for link in first_article.find_all('a'):
        href = link.get('href')
        if not href:
            continue

        match = category_pattern.search(href)
        if match:
            yr, beer_name = match.groups()
            # Store in a dict to prevent duplicate scraping of the same URL
            if href not in beers:
                beers[href] = {"yr": yr, "beer_name": beer_name}

    if not beers:
        print("No categories found.")
        return

    print(f"Found {len(beers)} unique categories. Starting scrape...")

    # 3. Flattened Loop: Iterate through the beers directly
    for href, data in beers.items():
        yr = data["yr"]
        beer_name = data["beer_name"]

        dir_path = Path(f"./{yr}")
        dir_path.mkdir(parents=True, exist_ok=True)

        file_name = f"{beer_name}.html"
        full_path = dir_path / file_name

        # Skip if file already exists (makes the script resumable if it fails halfway)
        if full_path.exists():
            print(f"Already exists, skipping: {full_path}")
            continue

        print(f"Fetching: {beer_name} ({yr})")

        try:
            cat_response = session.get(href)
            cat_response.raise_for_status()

            cat_soup = BeautifulSoup(cat_response.text, 'html.parser')
            article = cat_soup.find('article')

            if article and article.parent:
                container = article.parent  # BUG FIX: .parent is a property, not a method

                # BUG FIX: Must cast the container to a string before writing
                full_path.write_text(str(container), encoding="utf-8")
            else:
                print(f"  -> Warning: No article container found for {beer_name}")

        except requests.RequestException as e:
            print(f"  -> Error fetching {href}: {e}")

        # Be polite to the server
        time.sleep(2)

if __name__ == '__main__':
    sys.exit(main())
