import { GoogleGenerativeAI } from "@google/generative-ai";

const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

// Use pipe as delimiter to avoid collision with commas inside field values
const DELIMITER = "|";

// IMPORTANT: keep only the matrimonial-relevant extraction schema
// This prevents misalignment/pollution of "phone" with unrelated fields.
const MATRIMONIAL_COLUMNS =
  "Name|Gender|Age|Height|Education|Profession|Location|Marital Status|Sect|Family Details|Father Name|Father Occupation|Mother Name|Mother Occupation|Siblings|Brothers|Sisters|Brother In Laws|Sister In Laws|Grandparents|Requirements|Contact Numbers|Tags|Image";

// Models to try in order — fall back if one is overloaded or unavailable
// Only models confirmed available via the Gemini API (generateContent supported)
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",        // Latest stable Flash — fast & capable
  "gemini-2.0-flash",        // Previous-gen Flash fallback
  "gemini-2.0-flash-lite",   // Lightweight fallback for high-load periods
  "gemini-2.5-flash-lite",   // New lite model as last resort
];

const TRANSLATE_TO_ROMAN_COLUMNS = [
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
  "Education",
  "Profession",
  "Location",
  "Sect",
  "Requirements",
  "Tags",
] as const;

function containsUrduScript(text: string): boolean {
  // Arabic script range covers Urdu (and Arabic/Persian). Good-enough detection.
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

/**
 * Calls generateContent with automatic retry + exponential backoff.
 * Falls back through MODEL_FALLBACK_CHAIN on 503/overloaded errors.
 */
async function generateWithRetry(
  promptParts: Parameters<ReturnType<typeof client.getGenerativeModel>["generateContent"]>[0],
  maxRetries = 3,
  baseDelayMs = 1500
): Promise<string> {
  let lastError: unknown;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    const model = client.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent(promptParts);
        return result.response.text().trim();
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable =
          msg.includes("503") ||
          msg.includes("Service Unavailable") ||
          msg.includes("high demand") ||
          msg.includes("overloaded") ||
          msg.includes("429") ||
          msg.includes("Too Many Requests");

        // 404 = model retired/unavailable — skip to next model immediately
        const isModelGone =
          msg.includes("404") ||
          msg.includes("Not Found") ||
          msg.includes("no longer available");

        if (isModelGone) {
          console.warn(`[gemini] ${modelName} is unavailable (${msg.slice(0, 80)}). Skipping to next model…`);
          break; // break inner loop, try next model
        }

        if (!isRetryable) throw err; // hard error — don't retry

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1.5s, 3s, 6s
          console.warn(
            `[gemini] ${modelName} attempt ${attempt} failed (${msg.slice(0, 80)}). Retrying in ${delay}ms…`
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn(
            `[gemini] ${modelName} exhausted ${maxRetries} retries. Trying next model…`
          );
        }
      }
    }
  }

  throw lastError;
}

async function translatePsvToRoman(psv: string): Promise<string> {
  const lines = psv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```"));

  if (lines.length <= 1) return psv;

  const header = lines[0].split(DELIMITER).map((h) => h.trim());
  const translateIdx = new Set<number>();
  header.forEach((h, idx) => {
    if ((TRANSLATE_TO_ROMAN_COLUMNS as readonly string[]).includes(h)) translateIdx.add(idx);
  });

  // If there are no target columns, skip.
  if (translateIdx.size === 0) return psv;

  // Quick scan: if none of the targeted cells contain Urdu script, skip translation call.
  let needsTranslation = false;
  for (let i = 1; i < lines.length && !needsTranslation; i++) {
    const cells = lines[i].split(DELIMITER);
    for (const idx of translateIdx) {
      const v = (cells[idx] ?? "").trim();
      if (v && v !== "-" && containsUrduScript(v)) {
        needsTranslation = true;
        break;
      }
    }
  }
  if (!needsTranslation) return psv;

  const translatePrompt = `You are a translation + transliteration engine for Urdu matrimonial listings.

You will receive pipe-delimited (|) tabular data.

TASK:
- Keep the table structure EXACTLY the same: same header, same number of rows, same column order, same delimiter |.
- Translate ONLY the columns listed below to Roman English/Roman Urdu (Latin letters).
- Do NOT translate names into different people; preserve names, but romanize Urdu script.
- Keep phone numbers exactly as-is.
- If a cell is "-" keep it as "-".
- Do not add/remove rows. Do not add extra commentary.

TRANSLATE THESE COLUMNS ONLY (if present in the header):
${TRANSLATE_TO_ROMAN_COLUMNS.join(", ")}

INPUT TABLE:
${lines.join("\n")}

OUTPUT:
Return ONLY the updated pipe-delimited table (header + rows).`;

  return await generateWithRetry(translatePrompt);
}

export async function extractDataFromImage(
  imageBase64: string,
  mimeType: string
): Promise<string> {

  const extractPrompt = `You are a matrimonial data extraction specialist for an Urdu/English newspaper.

Extract every matrimonial profile from this image and return ONLY a pipe-delimited (|) table with these exact headers:
${MATRIMONIAL_COLUMNS}

CRITICAL: Use PIPE character | as the column separator. Do NOT use commas as separators.
Each profile = one row. Never merge two profiles into one row.

FIELD RULES:
- If a field is not present or not visible in the image, output "-" (a single dash character) for that field.
- Do not hallucinate or guess missing data.
- Use the exact column order above.
- Put parent names/occupations in the dedicated fields (Father/Mother columns) instead of mixing inside "Family Details" when possible.
- For siblings/in-laws:
  - "Siblings" = short summary like "1 brother, 2 sisters" if known, else "-"
  - "Brothers"/"Sisters"/"Brother In Laws"/"Sister In Laws" can contain names + brief notes (married/location/job) if present, else "-"
- "Grandparents" = any available paternal/maternal/grandparents info, else "-"
- "Contact Numbers" must contain ONLY phone/WhatsApp/mobile numbers found in the profile (for multiple numbers use comma separation, never pipe inside field). Do not put addresses/education here.
- "Tags" is optional; if unsure, output "-".

OUTPUT FORMAT:
- First row = header: ${MATRIMONIAL_COLUMNS}
- Each subsequent row = one profile
- Separate columns with | only
- Do NOT quote fields
- Return ONLY the pipe-delimited data. No markdown, no extra text, no code blocks.`;

  const rawPsv = await generateWithRetry([
    { inlineData: { data: imageBase64, mimeType } },
    extractPrompt,
  ]);

  // Second pass: refine & validate
  const refinePrompt = `You are a HIGH-ACCURACY DATA REFINEMENT ENGINE for matrimonial listings.

You are given pipe-delimited (|) data extracted from a newspaper matrimonial image. Refine it strictly.

INPUT DATA:
${rawPsv}

COLUMNS (keep exactly in this order):
${MATRIMONIAL_COLUMNS}

RULES:
- If a field is not present or not visible in the image, output "-" (a single dash character) for that field.
- Do not hallucinate or guess missing data.
- Use the exact column order above.
- Use PIPE | as delimiter. NO commas as delimiters.
- DO NOT merge rows.
- DO NOT add rows that weren't in input.
- Ensure "Contact Numbers" contains only phone/WhatsApp/mobile numbers (no addresses, no education text).
- If multiple numbers exist in one profile, separate them with commas only (never use pipe inside a field).
- Return ONLY the pipe-delimited data with header row. No markdown, no code blocks, no extra text.`;

  const refinedPsv = await generateWithRetry(refinePrompt);

  // Third pass: translate Urdu-script cells into Roman English/Roman Urdu (Latin)
  const translatedPsv = await translatePsvToRoman(refinedPsv);

  // Convert pipe-delimited back to proper CSV
  return psvToCsv(translatedPsv, DELIMITER);
}

/**
 * Converts a pipe-delimited string to a properly quoted CSV string.
 * This avoids the core problem where commas inside field values break CSV parsing.
 */
function psvToCsv(psv: string, delimiter: string = "|"): string {
  const lines = psv
    .split("\n")
    .map((l) => l.trim())
    // Strip markdown code fences if model adds them
    .filter((l) => l && !l.startsWith("```"));

  const csvLines = lines.map((line) => {
    const fields = line.split(delimiter).map((f) => f.trim());
    return fields
      .map((field) => {
        // Quote field if it contains comma, quote, or newline
        if (field.includes(",") || field.includes('"') || field.includes("\n")) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      })
      .join(",");
  });

  return csvLines.join("\n");
}

function splitTextIntoChunks(input: string, maxChars = 18000): string[] {
  const lines = input.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  const pushCurrent = () => {
    if (current.length > 0) chunks.push(current.join("\n"));
    current = [];
    size = 0;
  };

  for (const line of lines) {
    const l = line ?? "";
    const next = l.length + 1;
    if (size + next > maxChars && current.length > 0) {
      pushCurrent();
    }
    current.push(l);
    size += next;
  }
  pushCurrent();
  return chunks;
}

function parseWhatsAppMessages(raw: string): string[] {
  const lines = raw.split("\n");
  const messages: string[] = [];
  const sanitizeLine = (line: string) =>
    line
      .replace(/^\uFEFF/, "")
      .replace(/^[\u200E\u200F\u202A-\u202E]+/, "")
      .trimStart();
  const oldFormatRe =
    /^\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm]{2})?\s+[-–—]\s+/;
  const newBracketFormatRe =
    /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm]{2})?\]\s+/;
  let current = "";

  const isBoundary = (line: string) =>
    oldFormatRe.test(line) || newBracketFormatRe.test(line);

  const stripPrefix = (line: string): string => {
    if (oldFormatRe.test(line)) {
      // "12/05/24, 9:30 PM - Name: message" -> "Name: message"
      return line.replace(oldFormatRe, "").trim();
    }
    if (newBracketFormatRe.test(line)) {
      // "[12/05/2024, 9:30:12 PM] Name: message" -> "Name: message"
      return line.replace(newBracketFormatRe, "").trim();
    }
    return line.trim();
  };

  for (const rawLine of lines) {
    const line = sanitizeLine(rawLine);
    if (isBoundary(line)) {
      if (current.trim()) messages.push(current.trim());
      current = stripPrefix(line);
    } else {
      current += `${current ? "\n" : ""}${line}`;
    }
  }
  if (current.trim()) messages.push(current.trim());
  return messages;
}

function selectLikelyBiodataMessages(messages: string[]): string[] {
  const keywords = [
    "bio data", "biodata", "full name", "name:", "age", "height", "complexion",
    "education", "qualification", "job", "occupation", "work", "salary", "income",
    "family details", "father", "mother", "brother", "sister", "in law", "grand",
    "marital status", "sect", "maslak", "requirement", "preference", "contact",
    "phone", "mobile", "residence", "native place",
    // Roman Urdu and Urdu-script signals
    "rishta", "nikah", "nikahs", "taleem", "talim", "taaleem", "umar", "qad", "height:",
    "larka", "ladka", "ladki", "dulha", "dulhan", "maslak", "firqa", "cast", "zaat",
    "رشتہ", "نکاح", "عمر", "قد", "تعلیم", "ملازمت", "پیشہ", "خاندان", "والد", "والدہ", "رابطہ",
  ];

  const adminNoise = [
    "joined using a group link",
    "<media omitted>",
    "messages and calls are end-to-end encrypted",
    "this message was deleted",
    "join group",
    "we don't have any agents",
  ];

  const likely: string[] = [];
  for (const msg of messages) {
    const low = msg.toLowerCase();
    if (adminNoise.some((n) => low.includes(n))) continue;
    if (msg.length < 40) continue;
    const hits = keywords.reduce((acc, k) => acc + (low.includes(k) ? 1 : 0), 0);
    const hasPhone = /(?:\+?\d[\d\s\-().]{7,}\d)/.test(msg);
    if (hits >= 1 || hasPhone || msg.length > 300) likely.push(msg);
  }
  return likely;
}

function extractPsvRows(psv: string): string[] {
  return psv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```"));
}

function dedupePsvRows(rows: string[]): string[] {
  if (rows.length <= 2) return rows;
  const header = rows[0];
  const body = rows.slice(1);
  const seen = new Set<string>();
  const out: string[] = [header];
  for (const row of body) {
    // Keep stable dedupe key resilient to spacing
    const key = row.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function extractDataFromText(rawText: string): Promise<string> {
  const trimmed = rawText.trim();
  if (!trimmed) return "";

  // Remove common WhatsApp noise lines before model pass.
  const preprocessed = trimmed
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/<Media omitted>/i.test(l)) return false;
      if (/Messages and calls are end-to-end encrypted/i.test(l)) return false;
      if (/joined using a group link/i.test(l)) return false;
      return true;
    })
    .join("\n");

  const messages = parseWhatsAppMessages(preprocessed);
  const profileLikeMessages = selectLikelyBiodataMessages(messages);
  const reducedInput = profileLikeMessages.length > 0
    ? profileLikeMessages.join("\n\n---\n\n")
    : preprocessed;

  // Bigger chunks + cap to keep runtime practical on huge exports.
  const chunks = splitTextIntoChunks(reducedInput, 26000).slice(0, 8);
  const allRows: string[] = [];

  for (const [idx, chunk] of chunks.entries()) {
    const extractPrompt = `You are a matrimonial biodata extraction specialist.

You will be given a WhatsApp chat export chunk. It contains noise + multiple messages.
Extract ONLY complete matrimonial profile entries and return a pipe-delimited (|) table.

HEADERS (must be exact and in this order):
${MATRIMONIAL_COLUMNS}

STRICT RULES:
- One profile = one row.
- Do NOT merge two different people into one row.
- Ignore chat noise, media markers, admin notes, join/leave logs, stickers, links, greetings.
- If a field is missing, write "-" only.
- Keep Contact Numbers as numbers only (multiple separated by commas, never by pipe).
- Return ONLY table text (header + rows), no markdown.

INPUT CHUNK ${idx + 1}/${chunks.length}:
${chunk}`;

    const rawPsv = await generateWithRetry(extractPrompt, 2, 1000);

    const refinePrompt = `You are a data refinement engine for matrimonial biodata.

Refine this extracted table and fix row boundaries.
Do not add or remove people unless a row is clearly a duplicate in this same input.

HEADERS:
${MATRIMONIAL_COLUMNS}

RULES:
- Keep exact column order and | delimiter.
- Keep one person per row.
- Ensure family-related details go to family columns (Father/Mother/Siblings/In-laws/Grandparents).
- Keep "-" for unknown fields.

INPUT:
${rawPsv}

OUTPUT:
Only refined pipe-delimited table (header + rows).`;

    const refinedPsv = await generateWithRetry(refinePrompt, 2, 1000);
    const translatedPsv = await translatePsvToRoman(refinedPsv);
    const rows = extractPsvRows(translatedPsv);
    if (rows.length === 0) continue;

    // Keep first header only, skip repeated headers from subsequent chunks.
    if (allRows.length === 0) {
      allRows.push(rows[0], ...rows.slice(1));
    } else {
      allRows.push(...rows.slice(1));
    }
  }

  if (allRows.length === 0) {
    throw new Error("No matrimonial profiles found in text file");
  }
  const deduped = dedupePsvRows(allRows);
  if (deduped.length <= 1) {
    throw new Error("No matrimonial profiles found in text file");
  }
  return psvToCsv(deduped.join("\n"), DELIMITER);
}
