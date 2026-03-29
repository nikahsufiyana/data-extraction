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
  "Requirements",
  "Contact Numbers",
  "Tags",
] as const;

// ─── Noise words to strip from free-text fields ───────────────────────────────
const NOISE_WORDS = [
  "urgent",
  "call now",
  "whatsapp",
  "contact us",
  "please contact",
  "biodata",
  "bio data",
  "bio-data",
  "photo",
  "photo on whatsapp",
  "send photo",
  "agents excuse",
  "agent excuse",
  "no agent",
  "insha allah",
  "inshaallah",
  "alhamdulillah",
];

// ─── Profession normalization ─────────────────────────────────────────────────
function toTitle(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const PROFESSION_MAP: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/software\s*(eng(g?ineer(ing)?|r)?|developer|dev|programmer)/i, "Software Engineer"],
  [/(civil|mechanical|electrical|chemical|computer)\s*eng(g?ineer(ing)?|r)?/i, (m) => `${toTitle(m[1])} Engineer`],
  [/eng(g?ineer(ing)?|r)/i, "Engineer"],
  [/(mbbs|m\.b\.b\.s|md|m\.d\.|doctor|physician|surgeon)/i, "Doctor"],
  [/govt\.?\s*(job|servant|employee|officer)?|government\s*(job|servant|employee|officer)?/i, "Government Job"],
  [/business(man|woman|person)?|entrepreneur/i, "Business"],
  [/teacher|lecturer|professor/i, "Teacher"],
  [/lawyer|advocate|attorney/i, "Lawyer"],
  [/accountant|ca\b|chartered\s*accountant/i, "Accountant"],
  [/nurse|nursing/i, "Nurse"],
  [/it\s*(professional|expert|specialist)?|information\s*tech/i, "IT Professional"],
  [/manager/i, "Manager"],
  [/bank(er|ing)?/i, "Banker"],
  [/police|army|military|navy|air\s*force/i, "Defense Services"],
  [/student/i, "Student"],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeGender(value: string, rowText: string): string {
  // Explicit column value takes highest priority
  const v = value.trim().toLowerCase();
  if (["boy", "male", "m"].includes(v)) return "Boy";
  if (["girl", "female", "f"].includes(v)) return "Girl";
  // Score-based fallback across full row text
  const text = `${value} ${rowText}`.toLowerCase();
  const boyScore = (text.match(/\b(boy|son|groom|dulha|brother|mr\.?)\b/g) ?? []).length;
  const girlScore = (text.match(/\b(girl|daughter|bride|dulhan|sister|ms\.?|mrs\.?)\b/g) ?? []).length;
  if (boyScore > girlScore) return "Boy";
  if (girlScore > boyScore) return "Girl";
  return "";
}

export function normalizeAge(value: string): string {
  if (!value) return "";
  // Accept ranges like 28-30 or 28–30
  const range = value.match(/(\d{2})\s*[-–]\s*(\d{2})/);
  if (range) return `${range[1]}-${range[2]}`;
  const single = value.match(/\b(\d{2,3})\b/);
  return single ? single[1] : "";
}

export function normalizeHeight(value: string): string {
  if (!value) return "";
  const v = value.trim().replace(/["""]/g, '"').replace(/[''']/g, "'");

  // Already correct: 5'8" or 5'8
  if (/^\d'\d{1,2}"?$/.test(v)) {
    const m = v.match(/^(\d)'(\d{1,2})/);
    if (m) return `${m[1]}'${parseInt(m[2])}"`;
  }

  // 5'08" or 5'08
  const feetInchPad = v.match(/^(\d)'0*(\d{1,2})"?$/);
  if (feetInchPad) return `${feetInchPad[1]}'${parseInt(feetInchPad[2])}"`;

  // 5.8 or 5.08
  const dot = v.match(/^(\d)\.(\d{1,2})$/);
  if (dot) return `${dot[1]}'${parseInt(dot[2])}"`;

  // "5 feet 8 inches" or "5 ft 8 in"
  const written = v.match(/(\d)\s*(?:feet?|ft\.?)\s*(\d{1,2})\s*(?:inch(?:es)?|in\.?)?/i);
  if (written) return `${written[1]}'${parseInt(written[2])}"`;

  // "5-8" (rare)
  const dash = v.match(/^(\d)-(\d{1,2})$/);
  if (dash) return `${dash[1]}'${parseInt(dash[2])}"`;

  return v;
}

export function normalizeContacts(value: string): string {
  if (!value) return "";
  // Extract all plausible phone number patterns (7–15 digits, with optional separators)
  const candidates = value.match(/[\d\s\(\)\-\+\.]{7,20}/g) ?? [];
  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    results.push(raw.trim().replace(/\s+/g, " "));
  }

  return results.join(" | ");
}

export function normalizeProfession(value: string): string {
  if (!value) return "";
  for (const [pattern, replacement] of PROFESSION_MAP) {
    if (pattern.test(value)) {
      if (typeof replacement === "function") {
        const m = value.match(pattern);
        return m ? (replacement as (m: RegExpMatchArray) => string)(m) : value;
      }
      return replacement as string;
    }
  }
  // Title-case fallback
  return value
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeLocation(value: string): string {
  if (!value) return "";
  const LOCATION_MAP: [RegExp, string][] = [
    [/\buae\b|united\s*arab\s*emirates/i, "UAE"],
    [/\bdubai\b/i, "Dubai"],
    [/\bksa\b|saudi\s*arabia/i, "KSA"],
    [/\busa\b|united\s*states/i, "USA"],
    [/\buk\b|united\s*kingdom/i, "UK"],
    [/\baustralia\b/i, "Australia"],
    [/\bcanada\b/i, "Canada"],
    [/\bhyderabad\b/i, "Hyderabad"],
    [/\bmumbai\b|bombay/i, "Mumbai"],
    [/\bdelhi\b|new\s*delhi/i, "Delhi"],
    [/\bbangalore\b|bengaluru/i, "Bangalore"],
    [/\bkarachi\b/i, "Karachi"],
    [/\blahore\b/i, "Lahore"],
    [/\bpakistan\b/i, "Pakistan"],
  ];
  for (const [re, label] of LOCATION_MAP) {
    if (re.test(value)) return label;
  }
  // Return cleaned value
  return value.trim().replace(/[^a-zA-Z ,]/g, "").trim();
}

export function normalizeMaritalStatus(value: string, rowText: string): string {
  const text = `${value} ${rowText}`.toLowerCase();
  if (/\b(divorce[de]?)\b/.test(text)) return "Divorced";
  if (/\bwidow(er)?\b/.test(text)) return "Widowed";
  if (/\bsecond\s*marriage\b|remarriage\b/.test(text)) return "Second Marriage";
  if (/\bunmarried\b|never\s*married\b/.test(text)) return "Unmarried";
  return value?.trim() || "";
}

export function normalizeSect(value: string, rowText: string): string {
  const text = `${value} ${rowText}`.toLowerCase();
  if (/\bfateha\s*parood\b/.test(text)) return "Fateha Parood";
  if (/\bdeobandi\b/.test(text)) return "Deobandi";
  if (/\bbarelvi\b/.test(text)) return "Barelvi";
  if (/\bwahabi\b|wahhabi\b/.test(text)) return "Wahabi";
  if (/\bshia\b|shiah\b/.test(text)) return "Shia";
  if (/\bsunni\b/.test(text)) return "Sunni";
  if (/\bahlul\s*hadith\b/.test(text)) return "Ahle Hadith";
  return value?.trim() || "";
}

export function removeNoise(value: string): string {
  if (!value) return "";
  let result = value;
  for (const noise of NOISE_WORDS) {
    result = result.replace(new RegExp(`\\b${noise}\\b`, "gi"), "");
  }
  // Remove leftover punctuation artifacts
  return result.replace(/\s{2,}/g, " ").replace(/^[\s,;.]+|[\s,;.]+$/g, "").trim();
}

export function generateTags(row: DataRow): string {
  const text = Object.values(row).join(" ").toLowerCase();
  const tags: string[] = [];

  if (/\burgent\b/.test(text)) tags.push("Urgent");
  if (/\bnri\b|abroad|overseas|foreign/.test(text)) tags.push("NRI");
  if (/\buae\b|dubai/.test(text)) tags.push("Dubai");
  if (/\bksa\b|saudi/.test(text)) tags.push("KSA");
  if (/\busa\b|united\s*states/.test(text)) tags.push("USA");
  if (/\buk\b|united\s*kingdom/.test(text)) tags.push("UK");
  if (/\baustralia\b/.test(text)) tags.push("Australia");
  if (/\bcanada\b/.test(text)) tags.push("Canada");
  if (/doctor|mbbs|physician|surgeon/.test(text)) tags.push("Doctor");
  if (/software\s*engineer/.test(text)) tags.push("Software Engineer");
  else if (/\bengineer/.test(text)) tags.push("Engineer");
  if (/govt|government\s*job/.test(text)) tags.push("Government Job");
  if (/\bbusiness/.test(text)) tags.push("Business");
  if (/divorce/.test(text)) tags.push("Divorced");
  if (/widow/.test(text)) tags.push("Widow");
  if (/second\s*marriage|remarriage/.test(text)) tags.push("Second Marriage");

  return tags.join(", ");
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function normalizeDataRows(rows: DataRow[]): DataRow[] {
  const processed: DataRow[] = [];

  for (const row of rows) {
    const normalized = normalizeRow(row);
    if (normalized) processed.push(normalized);
  }

  // Deduplicate by identity
  const seen = new Set<string>();
  return processed.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRow(row: DataRow): DataRow {
  const rowText = Object.values(row).join(" ");

  const name = (row["Name"] ?? "").trim();
  const gender = normalizeGender(row["Gender"] ?? "", rowText);
  const age = normalizeAge(row["Age"] ?? "");
  const height = normalizeHeight(row["Height"] ?? "");
  const education = cleanEducation(row["Education"] ?? "");
  const profession = normalizeProfession(row["Profession"] ?? "");
  const location = normalizeLocation(row["Location"] ?? "");
  const maritalStatus = normalizeMaritalStatus(row["Marital Status"] ?? "", rowText);
  const sect = normalizeSect(row["Sect"] ?? "", rowText);
  const familyDetails = removeNoise(row["Family Details"] ?? "");
  const requirements = removeNoise(row["Requirements"] ?? "");
  const contactNumbers = normalizeContacts(row["Contact Numbers"] ?? "");

  // Build the cleaned row in canonical column order
  const cleaned: DataRow = {
    Name: name,
    Gender: gender,
    Age: age,
    Height: height,
    Education: education,
    Profession: profession,
    Location: location,
    "Marital Status": maritalStatus,
    Sect: sect,
    "Family Details": familyDetails,
    Requirements: requirements,
    "Contact Numbers": contactNumbers,
    Tags: "", // will fill below
  };

  cleaned["Tags"] = generateTags(cleaned);

  return cleaned;
}

function cleanEducation(value: string): string {
  if (!value) return "";
  const VAGUE = [
    /\bseeking\b/i, /\bbeautiful\b/i, /\bfair\b/i, /\bgood\s*family\b/i,
    /\beducated\b/i, /\breligious\b/i, /\bdecent\b/i, /\brespectable\b/i,
    /\bgood\s*looking\b/i,
  ];
  for (const re of VAGUE) {
    if (re.test(value)) return "";
  }
  return value.trim();
}
