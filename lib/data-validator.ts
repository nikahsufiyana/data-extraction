import { DataRow } from "./csv-utils";

// ─── Canonical column order ───────────────────────────────────────────────────
export const MATRIMONIAL_HEADERS = [
  "Name",
  "Gender",
  "Age",
  "Height",
  "Education",
  "Profession",
  "Location",
  "Marital Status",
  "Sect",
  "Family Details",
  "Father Name",
  "Father Occupation",
  "Mother Name",
  "Mother Occupation",
  "Siblings",
  "Brothers",
  "Sisters",
  "Brother In Laws",
  "Sister In Laws",
  "Grandparents",
  "Requirements",
  "Contact Numbers",
  "Tags",
  "Image",
] as const;

const CANONICAL_ALIASES: Record<(typeof MATRIMONIAL_HEADERS)[number], string[]> = {
  Name: ["Name", "name", "full_name"],
  Gender: ["Gender", "gender", "sex"],
  Age: ["Age", "age"],
  Height: ["Height", "height"],
  Education: ["Education", "education", "education_details"],
  Profession: ["Profession", "profession", "job_title", "preferred_profession"],
  Location: ["Location", "location", "city", "state", "country", "address"],
  "Marital Status": ["Marital Status", "marital_status", "marital status", "marital_status_other"],
  Sect: ["Sect", "sect", "religion"],
  "Family Details": ["Family Details", "family_details", "family details", "bio", "about_me", "description"],
  "Father Name": ["Father Name", "father_name", "father"],
  "Father Occupation": ["Father Occupation", "father_occupation"],
  "Mother Name": ["Mother Name", "mother_name", "mother"],
  "Mother Occupation": ["Mother Occupation", "mother_occupation", "mother_occupation_other"],
  Siblings: ["Siblings", "siblings"],
  Brothers: ["Brothers", "brothers"],
  Sisters: ["Sisters", "sisters"],
  "Brother In Laws": ["Brother In Laws", "brother_in_laws"],
  "Sister In Laws": ["Sister In Laws", "sister_in_laws"],
  Grandparents: ["Grandparents", "grandparents", "maternal_paternal"],
  Requirements: ["Requirements", "requirements", "expectations", "partner_preferences", "preferred_location", "preferred_education", "preferred_occupation"],
  "Contact Numbers": [
    "Contact Numbers",
    "Contact Number",
    "contact",
    "phone",
    "mobile_number",
    "whatsapp_number",
    "whatsapp",
    "show_registered_mobile",
  ],
  Tags: ["Tags", "tags"],
  Image: ["Image", "image", "profile_photo", "photo", "photos", "profile_photos", "gallery_photos"],
};

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getValueByAliases(row: DataRow, aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && row[key] !== null && `${row[key]}`.trim() !== "") {
      return `${row[key]}`.trim();
    }
  }
  return "";
}

function joinNonEmpty(values: string[]): string {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of cleaned) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(", ");
}

function extractPhoneNumbers(text: string): string[] {
  if (!text) return [];
  const candidates = text.match(/(?:\+?\d[\d\s\-().]{6,}\d)/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const compact = raw.replace(/[^\d+]/g, "");
    const digits = compact.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(compact.startsWith("+") ? `+${digits}` : digits);
  }
  return out;
}

function sanitizeTags(raw: string): string {
  const txt = (raw || "").trim();
  if (!txt || txt === "-") return "";
  // If tags field is actually phone-like content, treat as invalid tag value.
  if (extractPhoneNumbers(txt).length > 0) return "";
  const allowed = txt
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !/\d{5,}/.test(x));
  return Array.from(new Set(allowed)).join(", ");
}

function generateBasicTags(row: DataRow): string {
  const text = Object.values(row).join(" ").toLowerCase();
  const tags: string[] = [];
  if (/\bnri\b|abroad|overseas|foreign|uae|dubai|ksa|saudi|qatar|oman|kuwait/.test(text)) tags.push("NRI");
  if (/\burgent\b/.test(text)) tags.push("Urgent");
  if (/\bdoctor\b|mbbs|physician|surgeon/.test(text)) tags.push("Doctor");
  if (/\bengineer\b/.test(text)) tags.push("Engineer");
  return Array.from(new Set(tags)).join(", ");
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function normalizeDataRows(rows: DataRow[]): DataRow[] {
  const mappedRows = rows.map((row) => {
    // Build case/format-insensitive view of incoming row keys
    const normalizedSource: DataRow = {};
    for (const [key, value] of Object.entries(row)) {
      normalizedSource[normalizeKey(key)] = value;
    }

    const mapped: DataRow = {};
    for (const header of MATRIMONIAL_HEADERS) {
      if (header === "Contact Numbers") {
        const values = [
          normalizedSource.phone,
          normalizedSource.mobile_number,
          normalizedSource.whatsapp_number,
          getValueByAliases(row, CANONICAL_ALIASES["Contact Numbers"]),
        ].filter(Boolean) as string[];
        mapped[header] = joinNonEmpty(values);
        continue;
      }

      const aliases = CANONICAL_ALIASES[header] ?? [header];
      const direct = normalizedSource[normalizeKey(header)];
      mapped[header] =
        (direct !== undefined && direct !== null && `${direct}`.trim() !== "")
          ? `${direct}`.trim()
          : getValueByAliases(row, aliases);
    }

    if (!mapped["Tags"]) mapped["Tags"] = generateBasicTags(mapped);
    const contactFromFamily = extractPhoneNumbers(
      [
        mapped["Contact Numbers"],
        mapped["Family Details"],
        mapped["Requirements"],
        mapped["Father Occupation"],
        mapped["Mother Occupation"],
      ].join(" ")
    );
    mapped["Contact Numbers"] = contactFromFamily.length > 0 ? contactFromFamily.join(", ") : "-";

    const cleanTags = sanitizeTags(mapped["Tags"]);
    mapped["Tags"] = cleanTags || generateBasicTags(mapped) || "-";

    return mapped;
  });

  // De-duplicate rows to avoid repeated profiles from forwarded/reposted messages.
  const seen = new Set<string>();
  return mappedRows.filter((row) => {
    const key = [
      (row["Name"] || "").toLowerCase().trim(),
      (row["Age"] || "").toLowerCase().trim(),
      (row["Height"] || "").toLowerCase().trim(),
      (row["Contact Numbers"] || "").toLowerCase().trim(),
      (row["Father Name"] || "").toLowerCase().trim(),
    ].join("|");
    if (!key.replace(/\|/g, "")) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
