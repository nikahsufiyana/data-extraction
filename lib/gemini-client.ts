import { GoogleGenerativeAI } from "@google/generative-ai";

const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

// Use pipe as delimiter to avoid collision with commas inside field values
const DELIMITER = "|";

const MATRIMONIAL_COLUMNS =
  "Name|Gender|Age|Height|Education|Profession|Location|Marital Status|Sect|Family Details|Requirements|Contact Numbers|Tags";

// Models to try in order — fall back if one is overloaded
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

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
1. Name: person's name if visible, else leave blank.
2. Gender: "Boy" or "Girl" only.
   - Boy keywords: boy, son, groom, dulha, brother, he, male, wanted bride
   - Girl keywords: girl, daughter, bride, dulhan, sister, she, female, wanted groom
3. Age: number only (e.g. "29 yrs" → 29). Ranges ok (28-30).
4. Height: X'Y" format only (e.g. 5'8"). No other format.
5. Education: degree only (BA, BSc, MBA, MBBS, BE, etc.).
6. Profession: normalized title (Software Engineer, Doctor, Engineer, Government Job, Business).
7. Location: city/country only (UAE, Dubai, KSA, USA, UK, Australia, Canada, Hyderabad, etc.)
8. Marital Status: Unmarried / Divorced / Widowed / Second Marriage
9. Sect: Sunni / Shia / Deobandi / Barelvi / Fateha Parood / etc. Blank if unknown.
10. Family Details: brief background only (caste, city of origin, family type).
11. Requirements: what the profile seeks in a partner. No phone numbers, no "urgent".
12. Contact Numbers: all phone numbers for THIS profile only, separated by " , ". No duplicates.
13. Tags: from this list only, separated by " , ": Urgent, NRI, Dubai, KSA, USA, UK, Australia, Canada, Doctor, Engineer, Software Engineer, Government Job, Business, Divorced, Widow, Second Marriage

OUTPUT FORMAT:
- First row = header: Name|Gender|Age|Height|Education|Profession|Location|Marital Status|Sect|Family Details|Requirements|Contact Numbers|Tags
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
Name|Gender|Age|Height|Education|Profession|Location|Marital Status|Sect|Family Details|Requirements|Contact Numbers|Tags

RULES:

NAME: Person's name if visible. Leave blank if not in source.

GENDER: "Boy" or "Girl" only. Detect from all text in the row.

AGE: Number only. "29 yrs" → 29. Range "28-30" ok. Blank if unparseable.

HEIGHT: Must be X'Y" format. 5.8 → 5'8" | 5'08" → 5'8" | 5 feet 8 → 5'8". Blank if unparseable.

EDUCATION: Actual degree only: BA, BSc, MBA, MBBS, BE, MCA, LLB, MS, etc. Strip vague words.

PROFESSION: Normalize:
  - Software Engr / Software Dev → Software Engineer
  - Engineer / Engr / BE → Engineer
  - Doctor / MBBS / MD → Doctor
  - Govt Job → Government Job
  - Businessman → Business

LOCATION: Place names only. UAE, Dubai, KSA, USA, UK, Australia, Canada, Hyderabad, etc.

MARITAL STATUS: Unmarried / Divorced / Widowed / Second Marriage. Blank if unknown.

SECT: Sunni / Shia / Deobandi / Barelvi / Fateha Parood / Wahabi. Blank if not mentioned.

FAMILY DETAILS: Background only. Remove phone numbers, requirements, noise words.

REQUIREMENTS: What they seek. Remove phone numbers, "urgent", "call now".

CONTACT NUMBERS: Phone numbers for THIS profile only. Separate with " , ". Remove duplicates.

TAGS: Only from: Urgent, NRI, Dubai, KSA, USA, UK, Australia, Canada, Doctor, Engineer, Software Engineer, Government Job, Business, Divorced, Widow, Second Marriage
Separate with " , ". Blank if none apply.

STRICT RULES:
- Use PIPE | as delimiter. NO commas as delimiters.
- DO NOT merge rows.
- DO NOT hallucinate. Leave blank if unsure.
- DO NOT add rows that weren't in input.
- Return ONLY the pipe-delimited data with header row. No markdown, no code blocks, no extra text.`;

  const refinedPsv = await generateWithRetry(refinePrompt);

  // Convert pipe-delimited back to proper CSV
  return psvToCsv(refinedPsv, DELIMITER);
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
