import argparse
import json
import time
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup
import requests

BASE_URL = "https://www.beer-analytics.com"
INDEX_URL = f"{BASE_URL}/yeasts/"
# scripts/scrape/yeast_scraper.py -> <repo>/data/sources/beer-analytics-yeasts.json
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "data" / "sources" / "beer-analytics-yeasts.json"

HEADERS = {
    "User-Agent": "HomebrewResearchBot/1.0 (yeasts; Contact: leeb@lee-smith.org)"
}


def main():
  parser = argparse.ArgumentParser(description="Scrape beer-analytics.com yeast profiles.")
  parser.add_argument(
      "--limit",
      type=int,
      default=None,
      help="optional maximum number of yeasts to crawl (default: all)",
  )
  parser.add_argument(
      "--out",
      default=str(DEFAULT_OUTPUT),
      help="output path (default: data/sources/beer-analytics-yeasts.json)",
  )
  args = parser.parse_args()

  print("Fetching yeast index page...")
  response = requests.get(INDEX_URL, headers=HEADERS)

  if response.status_code != 200:
    print(f"Failed to fetch index. Status code: {response.status_code}")
    return

  soup = BeautifulSoup(response.text, "html.parser")
  yeast_links = set()  # Use a set to avoid any duplicate links

  # Find all anchor tags on the page
  for a in soup.find_all("a", href=True):
    href = a["href"]
    # Individual yeast links follow the pattern /yeasts/<category>/<strain-name>/
    # Category roots have fewer slashes (e.g., /yeasts/ale/ or /yeasts/)
    parts = [p for p in href.split("/") if p]
    if href.startswith("/yeasts/") and len(parts) >= 3:
      yeast_links.add(href)

  yeast_links = list(yeast_links)
  if args.limit and args.limit > 0:
    yeast_links = yeast_links[: args.limit]
  print(f"Found {len(yeast_links)} unique yeast profiles. Starting crawl...\n")

  all_yeasts_data = []

  for i, relative_url in enumerate(yeast_links):
    full_url = urljoin(BASE_URL, relative_url)

    try:
      res = requests.get(full_url, headers=HEADERS)
      if res.status_code != 200:
        print(
            f"[{i+1}/{len(yeast_links)}] Skipped: {full_url} (Status"
            f" {res.status_code})"
        )
        continue

      detail_soup = BeautifulSoup(res.text, "html.parser")
      yeast_data = {"url": full_url}

      detail_head = detail_soup.find("div", class_="detail-head")
      if detail_head:
        h1 = detail_head.find("h1")
        if h1:
          yeast_data["title"] = h1.text.strip()

        dl = detail_head.find("dl", class_="detail-info")
        if dl:
          for dt in dl.find_all("dt"):
            key = dt.text.strip().rstrip(":").lower()
            dd = dt.find_next_sibling("dd")
            if dd:
              yeast_data[key] = dd.text.strip()

      # Capture the long description using the concise CSS selector approach
      p_tag = detail_soup.select_one("div.detail-long-description p")
      if p_tag:
        yeast_data["description"] = p_tag.text.strip()

      all_yeasts_data.append(yeast_data)

      # Print terminal output
      print(
          f"[{i+1}/{len(yeast_links)}] Scraped:"
          f" {yeast_data.get('title', 'Unknown Yeast')}"
      )
      for k, v in yeast_data.items():
        if k != "title":
          print(f"  - {k.capitalize()}: {v}")
      print("-" * 40)

    except Exception as e:
      print(f"[{i+1}/{len(yeast_links)}] Error occurred on {full_url}: {e}")

    # Polite throttling
    time.sleep(1.5)

  # Export to JSON
  output_path = Path(args.out)
  output_path.parent.mkdir(parents=True, exist_ok=True)
  with open(output_path, "w", encoding="utf-8") as f:
    json.dump(all_yeasts_data, f, indent=4, ensure_ascii=False)

  print("\n--- Crawl Complete ---")
  print(f"Successfully collected data for {len(all_yeasts_data)} yeasts.")
  print(f"Data successfully saved to {output_path}")


if __name__ == "__main__":
  main()