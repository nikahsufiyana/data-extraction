#!/usr/bin/env python3
"""
Nikah Sufiyana — Matrimonial Data Refinement Engine
====================================================
Cleans, validates, and tags matrimonial CSV data extracted from newspaper images.

Usage:
    python clean_matrimonial_data.py input.csv output.csv
    python clean_matrimonial_data.py          # uses built-in sample data
"""

import csv
import re
import sys
from io import StringIO

# ── Canonical output columns ────────────────────────────────────────────────
OUTPUT_COLUMNS = [
    "Gender",
    "Age",
    "Height",
    "Education",
    "Profession",
    "Location",
    "Marital Status",
    "Sect",
    "Family Details",
    "Requirements",
    "Contact Numbers",
    "Tags",
]

# ── Noise words (removed from free-text fields) ──────────────────────────────
NOISE_WORDS = [
    r"\burgent\b",
    r"\bcall\s*now\b",
    r"\bwhatsapp\b",
    r"\bcontact\s*us\b",
    r"\bplease\s*contact\b",
    r"\bbiodata\b",
    r"\bbio\s*data\b",
    r"\bphoto\b",
    r"\bsend\s*photo\b",
    r"\bagents?\s*(excuse|please\s*excuse|not\s*required)\b",
    r"\bno\s*agents?\b",
    r"\binsha\s*allah\b",
    r"\binshaallah\b",
    r"\balhamdulillah\b",
]

# ── Vague education phrases to blank out ─────────────────────────────────────
VAGUE_EDUCATION = [
    r"\bseeking\b",
    r"\bbeautiful\b",
    r"\bfair\b",
    r"\bgood\s*family\b",
    r"\beducated\b",
    r"\breligious\b",
    r"\bdecent\b",
    r"\brespectable\b",
    r"\bgood\s*looking\b",
]

# ── Location mapping (regex → canonical label) ───────────────────────────────
LOCATION_MAP = [
    (r"\buae\b|united\s*arab\s*emirates", "UAE"),
    (r"\bdubai\b", "Dubai"),
    (r"\bksa\b|saudi\s*arabia", "KSA"),
    (r"\busa\b|united\s*states", "USA"),
    (r"\buk\b|united\s*kingdom", "UK"),
    (r"\baustralia\b", "Australia"),
    (r"\bcanada\b", "Canada"),
    (r"\bhyderabad\b", "Hyderabad"),
    (r"\bmumbai\b|bombay", "Mumbai"),
    (r"\bdelhi\b|new\s*delhi", "Delhi"),
    (r"\bbangalore\b|bengaluru", "Bangalore"),
    (r"\bkarachi\b", "Karachi"),
    (r"\blahore\b", "Lahore"),
    (r"\bpakistan\b", "Pakistan"),
]

# ── Profession normalization map ─────────────────────────────────────────────
PROFESSION_MAP = [
    (r"software\s*(eng(g?ineer(ing)?|r)?|developer|dev|programmer)", "Software Engineer"),
    (r"civil\s*eng(g?ineer(ing)?|r)?", "Civil Engineer"),
    (r"mechanical\s*eng(g?ineer(ing)?|r)?", "Mechanical Engineer"),
    (r"electrical\s*eng(g?ineer(ing)?|r)?", "Electrical Engineer"),
    (r"computer\s*eng(g?ineer(ing)?|r)?", "Computer Engineer"),
    (r"eng(g?ineer(ing)?|r)", "Engineer"),
    (r"mbbs|m\.b\.b\.s|md\b|m\.d\.|physician|surgeon|doctor", "Doctor"),
    (r"govt\.?\s*(job|servant|employee|officer)?|government\s*(job|servant|employee|officer)?", "Government Job"),
    (r"business(man|woman|person)?|entrepreneur", "Business"),
    (r"teacher|lecturer|professor", "Teacher"),
    (r"lawyer|advocate|attorney", "Lawyer"),
    (r"accountant|ca\b|chartered\s*accountant", "Accountant"),
    (r"nurse|nursing", "Nurse"),
    (r"it\s*(professional|expert|specialist)?|information\s*tech", "IT Professional"),
    (r"manager", "Manager"),
    (r"bank(er|ing)?", "Banker"),
    (r"police|army|military|navy|air\s*force", "Defense Services"),
    (r"student", "Student"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Field normalizers
# ─────────────────────────────────────────────────────────────────────────────

def normalize_gender(value: str, row_text: str) -> str:
    # Explicit column value takes highest priority
    v = value.strip().lower()
    if v in ("boy", "male", "m"):
        return "Boy"
    if v in ("girl", "female", "f"):
        return "Girl"
    # Fall back to scanning full row text
    text = f"{value} {row_text}".lower()
    # Use word-boundary patterns; avoid "boy" inside "tomboy" etc.
    boy_score = len(re.findall(r"\b(boy|son|groom|dulha|brother|mr\.?)\b", text))
    girl_score = len(re.findall(r"\b(girl|daughter|bride|dulhan|sister|ms\.?|mrs\.?)\b", text))
    if boy_score > girl_score:
        return "Boy"
    if girl_score > boy_score:
        return "Girl"
    return ""


def normalize_age(value: str) -> str:
    if not value:
        return ""
    # Age range: 28-30 or 28–30
    m = re.search(r"(\d{2})\s*[-–]\s*(\d{2})", value)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    # Single age
    m = re.search(r"\b(\d{2,3})\b", value)
    return m.group(1) if m else ""


def normalize_height(value: str) -> str:
    if not value:
        return ""
    v = value.strip().strip('"').replace('\u2019', "'").replace('\u2018', "'")

    # 5'8" or 5'8
    m = re.match(r"^(\d)'0*(\d{1,2})\"?$", v)
    if m:
        return f"{m.group(1)}'{int(m.group(2))}\""

    # 5.8 or 5.08
    m = re.match(r"^(\d)\.(\d{1,2})$", v)
    if m:
        return f"{m.group(1)}'{int(m.group(2))}\""

    # "5 feet 8 inches"
    m = re.search(r"(\d)\s*(?:feet?|ft\.?)\s*(\d{1,2})\s*(?:inch(?:es)?|in\.?)?", v, re.I)
    if m:
        return f"{m.group(1)}'{int(m.group(2))}\""

    # "5-8"
    m = re.match(r"^(\d)-(\d{1,2})$", v)
    if m:
        return f"{m.group(1)}'{int(m.group(2))}\""

    return v


def normalize_contacts(value: str) -> str:
    """Extract all plausible phone numbers from the field, deduplicate."""
    if not value:
        return ""
    # Match sequences of 7–15 digits (with optional separators)
    candidates = re.findall(r"[\d\s\(\)\-\+\.]{7,20}", value)
    seen = set()
    results = []
    for raw in candidates:
        digits = re.sub(r"\D", "", raw)
        if len(digits) < 7 or len(digits) > 15:
            continue
        if digits in seen:
            continue
        seen.add(digits)
        results.append(raw.strip())
    return " | ".join(results)


def normalize_profession(value: str) -> str:
    if not value:
        return ""
    for pattern, label in PROFESSION_MAP:
        if re.search(pattern, value, re.I):
            return label
    # Title-case fallback
    return " ".join(w.capitalize() for w in value.strip().split())


def normalize_location(value: str) -> str:
    if not value:
        return ""
    for pattern, label in LOCATION_MAP:
        if re.search(pattern, value, re.I):
            return label
    # Return cleaned plain text
    clean = re.sub(r"[^a-zA-Z ,]", "", value).strip()
    return clean


def normalize_marital_status(value: str, row_text: str) -> str:
    text = f"{value} {row_text}".lower()
    if re.search(r"\bdivorce[de]?\b", text):
        return "Divorced"
    if re.search(r"\bwidow(er)?\b", text):
        return "Widowed"
    if re.search(r"\bsecond\s*marriage\b|\bremarriage\b", text):
        return "Second Marriage"
    if re.search(r"\bunmarried\b|\bnever\s*married\b", text):
        return "Unmarried"
    return value.strip() if value else ""


def normalize_sect(value: str, row_text: str) -> str:
    text = f"{value} {row_text}".lower()
    if re.search(r"\bfateha\s*parood\b", text):
        return "Fateha Parood"
    if re.search(r"\bdeobandi\b", text):
        return "Deobandi"
    if re.search(r"\bbarelvi\b", text):
        return "Barelvi"
    if re.search(r"\bwahab[i]?\b|wahhabi\b", text):
        return "Wahabi"
    if re.search(r"\bshia[h]?\b", text):
        return "Shia"
    if re.search(r"\bsunni\b", text):
        return "Sunni"
    if re.search(r"\bahle?\s*hadith\b", text):
        return "Ahle Hadith"
    return value.strip() if value else ""


def clean_education(value: str) -> str:
    if not value:
        return ""
    for pattern in VAGUE_EDUCATION:
        if re.search(pattern, value, re.I):
            return ""
    return value.strip()


def remove_noise(value: str) -> str:
    if not value:
        return ""
    result = value
    for pattern in NOISE_WORDS:
        result = re.sub(pattern, "", result, flags=re.I)
    # Clean up residual punctuation/whitespace
    result = re.sub(r"\s{2,}", " ", result)
    result = re.sub(r"^[\s,;.]+|[\s,;.]+$", "", result)
    return result.strip()


def generate_tags(row: dict) -> str:
    text = " ".join(str(v) for v in row.values()).lower()
    tags = []
    if re.search(r"\burgent\b", text):
        tags.append("Urgent")
    if re.search(r"\bnri\b|abroad|overseas|foreign", text):
        tags.append("NRI")
    if re.search(r"\buae\b|dubai", text):
        tags.append("Dubai")
    if re.search(r"\bksa\b|saudi", text):
        tags.append("KSA")
    if re.search(r"\busa\b|united\s*states", text):
        tags.append("USA")
    if re.search(r"\buk\b|united\s*kingdom", text):
        tags.append("UK")
    if re.search(r"\baustralia\b", text):
        tags.append("Australia")
    if re.search(r"\bcanada\b", text):
        tags.append("Canada")
    if re.search(r"doctor|mbbs|physician|surgeon", text):
        tags.append("Doctor")
    if re.search(r"software\s*engineer", text):
        tags.append("Software Engineer")
    elif re.search(r"\bengineer", text):
        tags.append("Engineer")
    if re.search(r"govt|government\s*job", text):
        tags.append("Government Job")
    if re.search(r"\bbusiness", text):
        tags.append("Business")
    if re.search(r"divorce", text):
        tags.append("Divorced")
    if re.search(r"\bwidow", text):
        tags.append("Widow")
    if re.search(r"second\s*marriage|remarriage", text):
        tags.append("Second Marriage")
    return ", ".join(tags)


# ─────────────────────────────────────────────────────────────────────────────
# Row cleaner
# ─────────────────────────────────────────────────────────────────────────────

def get_field(row: dict, *keys: str) -> str:
    """
    Try multiple key names (case-insensitive) for flexibility.
    Uses exact match first; partial/contains match only for keys >= 7 chars.
    Never lets a partial match on 'status' resolve to 'Marital Status'.
    """
    lower_row = {k.strip().lower(): v for k, v in row.items()}
    # 1. Exact match
    for key in keys:
        if key.lower() in lower_row:
            return (lower_row[key.lower()] or "").strip()
    # 2. Contains match — require key length >= 7 to avoid "status" → "Marital Status"
    for key in keys:
        if len(key) >= 7:
            for k, v in lower_row.items():
                if key.lower() in k:
                    return (v or "").strip()
    return ""


def clean_row(row: dict) -> dict:
    row_text = " ".join(str(v) for v in row.values())

    raw_gender        = get_field(row, "Gender", "Sex")
    raw_age           = get_field(row, "Age")
    raw_height        = get_field(row, "Height")
    raw_education     = get_field(row, "Education", "Qualification")
    raw_profession    = get_field(row, "Profession", "Occupation", "Job")
    raw_location      = get_field(row, "Location", "City", "Place")
    raw_marital       = get_field(row, "Marital Status", "Marital", "Matrimonial Status")
    raw_sect          = get_field(row, "Sect", "Religion", "Maslak")
    raw_family        = get_field(row, "Family Details", "Family", "Background")
    raw_requirements  = get_field(row, "Requirements", "Requirement", "Seeking", "Looking For", "Description")
    raw_contacts      = get_field(row, "Contact Numbers", "Contact", "Phone", "Mobile")

    cleaned = {
        "Gender":          normalize_gender(raw_gender, row_text),
        "Age":             normalize_age(raw_age),
        "Height":          normalize_height(raw_height),
        "Education":       clean_education(raw_education),
        "Profession":      normalize_profession(raw_profession),
        "Location":        normalize_location(raw_location),
        "Marital Status":  normalize_marital_status(raw_marital, row_text),
        "Sect":            normalize_sect(raw_sect, row_text),
        "Family Details":  remove_noise(raw_family),
        "Requirements":    remove_noise(raw_requirements),
        "Contact Numbers": normalize_contacts(raw_contacts),
        "Tags":            "",
    }

    cleaned["Tags"] = generate_tags(cleaned)
    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# CSV processor
# ─────────────────────────────────────────────────────────────────────────────

def process_csv(input_data: str) -> list[dict]:
    reader = csv.DictReader(StringIO(input_data))
    results = []
    seen = set()

    for row in reader:
        if not any(v.strip() for v in row.values()):
            continue
        cleaned = clean_row(row)
        key = str(cleaned)
        if key in seen:
            continue
        seen.add(key)
        results.append(cleaned)

    return results


def write_csv(rows: list[dict]) -> str:
    out = StringIO()
    writer = csv.DictWriter(out, fieldnames=OUTPUT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_CSV = (
    "Status,Gender,Age,Height,Education,Profession,Location,Description,Contact\n"
    "URGENT,Boy,29,5'10\",BA,Software Engr,Dubai,Fair girl required. Fateha Parood only.,(970) 481-6610\n"
    "URGENT,Boy,28,5'9\",MBBS,Doctor MBBS,KSA,Religious girl from educated family.,(739) 693-4773\n"
    "URGENT,Girl,27,5.7,BSc,Engineer,USA,Seeking educated employed boy.,(939) 058-7246\n"
    "URGENT,Boy,33,5'5\",MBA,Business,Hyderabad,Beautiful and religious girl. Ht 5'4 and above.,(799) 544-1311\n"
    "URGENT,Boy,30,5'11\",seeking beautiful,Educated,fair girl from good family.,(939) 200-1511\n"
    "URGENT,Boy,32,5'10\",BSc,Govt Job,,Seeking fair educated girl. Second marriage. Agents excuse.,(756) 916-6231\n"
    "URGENT,Boy,26,5'10\",BE,Civil Engineer,UK,Looking for a Sunni girl.,(967) 643-1152\n"
    "URGENT,Girl,28,5'8\",MCA,IT Professional,Australia,Well-settled boy preferred. NRI preferred.,(807) 484-0968\n"
    "URGENT,Boy,30,6'3\",BA,,,Very Fair. Requirement Height 5'7. Deobandi only.,(837) 463-6781\n"
)

if __name__ == "__main__":
    if len(sys.argv) == 3:
        input_path, output_path = sys.argv[1], sys.argv[2]
        with open(input_path, encoding="utf-8") as f:
            input_data = f.read()
        rows = process_csv(input_data)
        output = write_csv(rows)
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            f.write(output)
        print(f"✅  Wrote {len(rows)} cleaned profiles → {output_path}")
    elif len(sys.argv) == 2:
        with open(sys.argv[1], encoding="utf-8") as f:
            input_data = f.read()
        rows = process_csv(input_data)
        print(write_csv(rows))
    else:
        # Demo mode: process sample data
        rows = process_csv(SAMPLE_CSV)
        print(write_csv(rows))
        print(f"\n(ℹ️  Processed {len(rows)} sample profiles. Pass input.csv [output.csv] as arguments to process a file.)")
