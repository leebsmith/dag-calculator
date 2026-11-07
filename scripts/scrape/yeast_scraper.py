import argparse
import json
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.beer-analytics.com"
INDEX_URL = f"{BASE_URL}/yeasts/"
# scripts/scrape/yeast_scraper.py -> <repo>/data/sources/beer-analytics-yeasts.json
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "data" / "sources" / "beer-analytics-yeasts.json"

HEADERS = {
    "User-Agent": "HomebrewResearchBot/1.0 (yeasts; Contact: leeb@lee-smith.org)"
}


def _parse_args():
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
  return parser.parse_args()


def _collect_links(soup, limit=None):
  """Individual yeast links are /yeasts/<category>/<strain-name>/; category roots have fewer slashes."""
  links = set()
  for a in soup.find_all("a", href=True):
    href = a["href"]
    parts = [p for p in href.split("/") if p]
    if href.startswith("/yeasts/") and len(parts) >= 3:
      links.add(href)
  collected = list(links)
  if limit and limit > 0:
    collected = collected[:limit]
  return collected


def _pof(value):
  """Normalize a vendor POF field; absent/unrecognised is an explicit unknown."""
  text = str(value or "").strip().lower()
  if "negative" in text or text in {"non-pof", "pof-"}:
    return "negative"
  if "positive" in text or text in {"pof", "pof+"}:
    return "positive"
  return "unknown"


def _parse_detail(detail_soup, full_url):
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

  p_tag = detail_soup.select_one("div.detail-long-description p")
  if p_tag:
    yeast_data["description"] = p_tag.text.strip()

  yeast_data["pof"] = _pof(yeast_data.get("pof"))
  return yeast_data


def _report_entry(index, total, yeast_data):
  print(
      f"[{index+1}/{total}] Scraped:"
      f" {yeast_data.get('title', 'Unknown Yeast')}"
  )
  for k, v in yeast_data.items():
    if k != "title":
      print(f"  - {k.capitalize()}: {v}")
  print("-" * 40)


def main():
  args = _parse_args()

  print("Fetching yeast index page...")
  response = requests.get(INDEX_URL, headers=HEADERS)

  if response.status_code != 200:
    print(f"Failed to fetch index. Status code: {response.status_code}")
    return

  soup = BeautifulSoup(response.text, "html.parser")
  yeast_links = _collect_links(soup, args.limit)
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
      yeast_data = _parse_detail(detail_soup, full_url)
      all_yeasts_data.append(yeast_data)

      _report_entry(i, len(yeast_links), yeast_data)

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
