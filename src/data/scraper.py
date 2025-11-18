# === Imports, etc ===
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import os
from dotenv import load_dotenv
import requests
from data.syllabus_data import Department, Season, SyllabusMap, Year
import re
import json
from collections import defaultdict

@dataclass
class FileWithUrl:
    season: Season
    year: Year
    number: str
    section: str
    url: str

# === Helpers ===
# Term/date
def is_term_at_least_F22(season: Season, year: Year) -> bool:
    if year.value > 2022:
        return True
    if year.value < 2022:
        return False
    # If the year is 2022, only Fall is allowed
    return season == Season.Fall

# Convert (season, year) to something like 'F22', 'S23', etc.
def season_year_to_term_code(season, year) -> str:
    season_str = str(season)
    if "Fall" in season_str:
        prefix = "F"
    elif "Spring" in season_str:
        prefix = "S"
    else:
        prefix = "Su" # Summer

    # Handle Year(value) or plain int
    if hasattr(year, "value"):
        y = year.value
    else:
        y = int(year)

    return f"{prefix}{y % 100:02d}" # Ex: 2025 -> '25'

# Parses title strings to extract course number and section
def parse_title(title: str) -> Tuple[str, str]:
    # (Dept Name) 00XXX -> "00XXX"
    m = re.search(r"\((\d{2,5}X+)\)", title)
    if m:
        return m.group(1), ""

    # F25 00XXX -> "00XXX"
    m = re.search(r"\b[FS][0-9]{2}\s+([0-9]{5})", title)
    if m:
        return m.group(1), ""

    # Remove everything before first digit
    first_digit_idx = next((i for i, ch in enumerate(title) if ch.isdigit()), None)
    if first_digit_idx is None:
        return "unknown", ""

    title = title[first_digit_idx:]

    # Keep only the part before space/dot/underscore/colon
    title = re.split(r"[ ._:]", title, maxsplit=1)[0]

    parts = title.split("-")

    if len(parts) == 0 or (len(parts) == 1 and parts[0] == ""):
        return "unknown", ""
    elif len(parts) == 1:
        course_num = parts[0]
        return course_num, ""
    elif len(parts) == 2:
        course_num, section = parts
        if len(course_num) == 5:
            return course_num, section
        return course_num + section, ""
    elif len(parts) == 3:
        course_num, label, third = parts
        if label.lower() in ("objectives", "syllabus"):
            return course_num, ""
        return course_num + label, third
    else:
        first, second, *rest = parts
        return first + second, "-".join(rest)

# Given a Canvas course URL, extract the course ID part
def extract_canvas_course_id_from_url(url: str) -> str:
    m = re.search(r"/courses/([^/?#]+)", url)
    if not m:
        raise ValueError(f"Could not extract course id from URL: {url}")
    return m.group(1)

# Generates all combinations of Department, Season, Year
def generate_combinations() -> List[Tuple[Department, Season, Year]]:
    combinations: List[Tuple[Department, Season, Year]] = []

    for department in Department.all():
        for season in Season.all():
            for year in Year.all():
                combinations.append((department, season, year))

    return combinations


# === Export/JSON ===
def syllabus_map_to_json_struct(syllabus_map: SyllabusMap) -> List[Dict]:
    by_course: Dict[str, Dict] = defaultdict(
        lambda: {"id": "", "name": "", "syllabi": []}
    )

    for (year, season, number, section), url in syllabus_map.items():
        term_code = season_year_to_term_code(season, year)

        course_entry = by_course[number]
        if not course_entry["id"]:
            course_entry["id"] = number

        # TODO: populate course name
        if not course_entry["name"]:
            course_entry["name"] = "" # Placeholder

        course_entry["syllabi"].append(
            {
                "term": term_code,
                "section": section or "",
                # TODO: populate instructor names (requires access token with the right perms to access all courses)
                "instructors": [], # Placeholder
                "url": url,
            }
        )

    return list(by_course.values())

def write_syllabi_json(syllabus_map: SyllabusMap, path: str) -> None:
    data = syllabus_map_to_json_struct(syllabus_map)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# === Scraping ===
def process_department_modules(
    department: Department,
    season: Season,
    year: Year,
    token: str,
) -> Optional[List[FileWithUrl]]:
    base_url = os.environ.get("CANVAS_BASE_URL", "https://canvas.cmu.edu")

    # Syllabus registry
    course_id = 3769

    headers = { "Authorization": f"Bearer {token}" }

    # 1. Fetch modules
    modules_url = f"{base_url}/api/v1/courses/{course_id}/modules"
    print(f"\n[process_department_modules] GET {modules_url}")

    try:
        resp = requests.get(modules_url, headers=headers, timeout=15)
    except requests.RequestException as e:
        print(f"Failed to fetch modules: {e}")
        return None

    if not resp.ok:
        print("Modules request failed:", resp.status_code)
        print(resp.text[:300])
        return None

    try:
        modules = resp.json()
    except ValueError:
        print("Invalid JSON in modules response")
        return None

    print(f"[process_department_modules] Found {len(modules)} modules")

    season_str = str(season)
    year_str = str(year)

    def is_matching_module(m):
        name = m.get("name", "")
        return season_str in name and year_str in name

    matching_modules = [m for m in modules if is_matching_module(m)]

    if not matching_modules:
        print(f"No module matches '{season_str}' '{year_str}', trying fallback '(F25)'")
        fallback = [m for m in modules if "(F25)" in m.get("name", "")]
        if not fallback:
            print("No fallback module found.")
            return None
        module = fallback[0]
    else:
        module = matching_modules[0]

    print("[process_department_modules] Using module:",
          module.get("id"), module.get("name"))

    items_url = module.get("items_url")
    if not items_url:
        print("Module has no items_url")
        return None

    # 2. Fetch items
    print("[process_department_modules] GET", items_url)
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=15)
    except requests.RequestException as e:
        print(f"Failed to fetch items: {e}")
        return None

    if not items_resp.ok:
        print("Items request failed:", items_resp.status_code)
        print(items_resp.text[:300])
        return None

    try:
        items = items_resp.json()
    except ValueError:
        print("Invalid JSON in items response")
        return None

    print(f"[process_department_modules] Found {len(items)} items")

    # Debug print all items
    # for it in items:
    #     print(
    #         "  Item:",
    #         it.get("id"),
    #         "| type:", it.get("type"),
    #         "| title:", it.get("title"),
    #         "| url:", it.get("url"),
    #         "| html_url:", it.get("html_url"),
    #         "| external_url:", it.get("external_url"),
    #     )


    files: List[FileWithUrl] = []

    for item in items:
        item_type = item.get("type")
        title = str(item.get("title", ""))

        # Prefer external_url for ExternalUrl items
        if item_type == "ExternalUrl":
            file_url = item.get("external_url") or item.get("html_url") or item.get("url")
        else:
            file_url = item.get("html_url") or item.get("url")

        if not file_url:
            print("  Skipping item with empty URL:", title)
            continue

        file_url = str(file_url).strip()

        number, section = parse_title(title)
        if number == "unknown":
            print("  [parse_title] Could not parse:", title)
            number = "unknown"
            section = ""

        files.append(
            FileWithUrl(
                number=number,
                section=section,
                season=season,
                year=year,
                url=file_url,
            )
        )

    print(f"[process_department_modules] Extracted {len(files)} file-like items")
    return files or None

# Given the department-level syllabus registry course URL, scrape its modules for the actual courses/individual course syllabi
# Returns a list of FielWithUrl with number (course number), section (course section), url (url to syllabus)
def scrape_registry_course(
    registry_url: str,
    season: Season,
    year: Year,
    token: str,
) -> List[FileWithUrl]:
    base_url = os.environ.get("CANVAS_BASE_URL", "https://canvas.cmu.edu")
    headers = {"Authorization": f"Bearer {token}"}

    course_id = extract_canvas_course_id_from_url(registry_url)

    # 1) Fetch modules in the registry course
    modules_url = f"{base_url}/api/v1/courses/{course_id}/modules"
    print(f"[scrape_registry_course] GET {modules_url}")

    try:
        resp = requests.get(modules_url, headers=headers, timeout=15)
    except requests.RequestException as e:
        print(f"  Failed to fetch modules for registry {registry_url}: {e}")
        return []

    if not resp.ok:
        print("  Registry modules request failed:", resp.status_code)
        print(resp.text[:300])
        return []

    try:
        modules = resp.json()
    except ValueError:
        print("  Invalid JSON in registry modules response")
        return []

    print(f"[scrape_registry_course] Found {len(modules)} modules in registry")

    all_files: List[FileWithUrl] = []

    for module in modules:
        items_url = module.get("items_url")
        if not items_url:
            continue

        print("  [scrape_registry_course] GET items for module",
              module.get("id"), module.get("name"))

        try:
            items_resp = requests.get(items_url, headers=headers, timeout=15)
        except requests.RequestException as e:
            print(f"    Failed to fetch items: {e}")
            continue

        if not items_resp.ok:
            print("    Items request failed:", items_resp.status_code)
            print(items_resp.text[:200])
            continue

        try:
            items = items_resp.json()
        except ValueError:
            print("    Invalid JSON for items")
            continue

        for item in items:
            item_type = item.get("type")
            title = str(item.get("title", ""))

            # For registry, syllabi might be Files, Pages, or ExternalUrl
            if item_type == "ExternalUrl":
                syllabus_url = item.get("external_url") or item.get("html_url") or item.get("url")
            else:
                syllabus_url = item.get("html_url") or item.get("url")

            if not syllabus_url:
                continue

            syllabus_url = str(syllabus_url).strip()

            number, section = parse_title(title)
            if number == "unknown":
                print("    [scrape_registry_course] Could not parse course number from:", title)
                continue

            all_files.append(
                FileWithUrl(
                    season=season,
                    year=year,
                    number=number,
                    section=section,
                    url=syllabus_url,
                )
            )

    print(f"[scrape_registry_course] Extracted {len(all_files)} syllabi from registry")
    return all_files

# Scrapes Canvas, builds SyallbusMap: (year, season, number, section) -> url
def create_syllabus_map() -> SyllabusMap:
    load_dotenv()
    canvas_access_token = os.environ["CANVAS_ACCESS_TOKEN"]

    syllabus_map: SyllabusMap = {}
    combinations = generate_combinations()   # TODO: restore full combos when ready
    for department, season, year in combinations:
        if not is_term_at_least_F22(season, year):
            continue

        print(f"\n=== Processing {department} {season} {year} ===")

        # Get department-level registry URLs from master course 3769
        registry_links = process_department_modules(
            department, season, year, canvas_access_token
        )

        if not registry_links:
            print("No registry links found for this (dept, term)")
            continue

        # For each registry course, pull individual syllabi
        for registry in registry_links:
            per_course_files = scrape_registry_course(
                registry.url, season, year, canvas_access_token
            )

            for file in per_course_files:
                key = (file.year, file.season, file.number, file.section)
                syllabus_map[key] = file.url

    return syllabus_map



# === Testing ===

def _test_parse_title():
    assert parse_title("02701-A: CPCB Course - Current Topics in Computational Biology") == (
        "02701",
        "A",
    )

    assert parse_title("14513-syllabus-f18.pdf") == ("14513", "")

    assert parse_title("14809- Introduction to Cyber Intelligence.pdf") == ("14809", "")

    assert parse_title("14815 Syllabus.docx") == ("14815", "")

    assert (
        parse_title(
            "49-747_InnovationMindsetinPractice_Ayoob_E_Bodily_B.docx"
        )
        == ("49747", "")
    )

    assert parse_title("CMUiii_MIIPS Online 49-600_Syllabus.pdf") == ("49600", "")

    assert parse_title("85314.docx") == ("85314", "")

    assert parse_title(
        "98317-A: Student Taught Courses (StuCo): Hype for Types"
    ) == ("98317", "A")


def _test_generate_combinations():
    combinations = generate_combinations()
    expected_count = len(Department.all()) * len(Season.all()) * len(Year.all())
    assert len(combinations) == expected_count

    assert (Department.CS, Season.Fall, Year(2020)) in combinations
    assert (Department.MSC, Season.Spring, Year(2019)) in combinations

# === Main ===

if __name__ == "__main__":
    syllabus_map = create_syllabus_map()
    print(f"\nTotal entries: {len(syllabus_map)}")

    write_syllabi_json(syllabus_map, "syllabi_after_F22.json")
    print("Wrote syllabi_after_F22.json")
