import os
import glob
import json
import re
from bs4 import BeautifulSoup

def clean_prose(element):
    if not element:
        return ""
    for header in element.find_all(['h2', 'h3']):
        header.decompose()
    return element.get_text(separator=' ', strip=True)

def parse_bjcp_directory(directory="."):
    parsed_styles = []
    html_files = glob.glob(os.path.join(directory, "*.html"))
    
    for file_path in html_files:
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f, "html.parser")
            
        articles = soup.find_all("article", class_="style")
        
        for article in articles:
            style_data = {}
            
            # 1. Parse Title Identifier, Name, and Version
            title_tag = article.find("h1", class_="entry-title")
            if not title_tag:
                continue
                
            title_text = title_tag.get_text(strip=True)
            title_match = re.match(r"^([\w\d]+)\.\s*(.*)", title_text)
            if title_match:
                style_data["style_id"] = title_match.group(1)
                style_data["style_name"] = title_match.group(2)
            else:
                continue
                
            # Extract version from the href (e.g., /style/2021/)
            style_data["version"] = 2015 # Safe fallback
            a_tag = title_tag.find("a")
            if a_tag and a_tag.has_attr("href"):
                version_match = re.search(r"/style/(\d{4})/", a_tag["href"])
                if version_match:
                    style_data["version"] = int(version_match.group(1))
                
            # 2. Parse Prose Sections
            prose_map = {
                "overall_impression": "overall-impression",
                "appearance": "appearance",
                "aroma": "aroma",
                "flavor": "flavor",
                "mouthfeel": "mouthfeel",
                "comments": "comments",
                "history": "history",
                "characteristic_ingredients": "ingredients",
                "style_comparison": "style-comparison"
            }
            
            for schema_key, html_class in prose_map.items():
                div = article.find("div", class_=html_class)
                if div:
                    style_data[schema_key] = clean_prose(div)
                    
            # 3. Parse Vital Statistics
            vitals = {}
            vitals_div = article.find("div", class_="vital-statistics")
            
            if vitals_div:
                rows = vitals_div.find_all("div", class_="row")
                for row in rows:
                    cells = row.find_all("div", class_="cell")
                    if len(cells) == 2:
                        stat_key = cells[0].get_text(strip=True).lower()
                        stat_val = cells[1].get_text(strip=True)
                        
                        val_match = re.search(r"([\d\.]+)\%?\s*-\s*([\d\.]+)\%?", stat_val)
                        if val_match:
                            v_min = float(val_match.group(1))
                            v_max = float(val_match.group(2))
                            # ABV is now preserved as a whole percentage
                            vitals[stat_key] = {"min": v_min, "max": v_max}
                            
            if vitals:
                style_data["vital_statistics"] = vitals
                
            # 4. Parse Commercial Examples
            comm_div = article.find("div", class_="commercial-examples")
            if comm_div:
                text = clean_prose(comm_div)
                if text.endswith("."):
                    text = text[:-1]
                examples = [ex.strip() for ex in text.split(",") if ex.strip()]
                if examples:
                    style_data["commercial_examples"] = examples
                
            # 5. Parse Style Attributes
            attr_div = article.find("div", class_="style-attributes")
            if attr_div:
                tags = attr_div.find_all("a", rel="tag")
                style_data["style_attributes"] = [t.get_text(strip=True) for t in tags]
                
            parsed_styles.append(style_data)
                
    return parsed_styles

if __name__ == "__main__":
    extracted_data = parse_bjcp_directory()
    output_filename = "bjcp_styles.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(extracted_data, f, indent=2, ensure_ascii=False)
    print(f"Extraction complete. {len(extracted_data)} styles saved to {output_filename}.")