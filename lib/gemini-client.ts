import { GoogleGenerativeAI } from "@google/generative-ai";

const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

// Use pipe as delimiter to avoid collision with commas inside field values
const DELIMITER = "|";

// Full extraction schema as requested by user
const MATRIMONIAL_COLUMNS =
  "id|email|name|password|age|gender|location|city|country|education|profession|sect|height|marital_status|complexion|income|housing|show_photos|profile_photo|profile_photos|premium_plan|premium_expiry|premium_admin_approved|premium_approved_by|verified|last_active|profile_status|show_contact_info|hide_profile|subscription|phone|created_at|updated_at|is_verified|is_active|role|full_name|country_code|whatsapp_number|address|marriage_timeline|about_me|marital_status_other|education_details|job_title|family_details|father_name|father_occupation|father_mobile|mother_name|mother_occupation|mother_occupation_other|mother_mobile|housing_status|housing_status_other|siblings|brother_in_laws|maternal_paternal|grandparents|preferred_age_min|preferred_age_max|preferred_education|preferred_location|preferred_occupation|preferred_height|preferred_complexion|preferred_maslak|expectations|religious_inclination|show_online_status|show_registered_mobile|show_father_mobile|show_mother_mobile|show_father_number|show_mother_number|mobile_number|contact_info_visibility|profile_visibility|date_of_birth|skin_color|religion|state|company|family_type|family_values|bio|description|partner_preferences|preferred_height_min|preferred_height_max|preferred_profession|preferred_marital_status|whatsapp|profile_completion|is_premium|image|photo|photos|gallery_photos|needs_password_setup";

// Models to try in order — fall back if one is overloaded or unavailable
// Only models confirmed available via the Gemini API (generateContent supported)
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",        // Latest stable Flash — fast & capable
  "gemini-2.0-flash",        // Previous-gen Flash fallback
  "gemini-2.0-flash-lite",   // Lightweight fallback for high-load periods
  "gemini-2.5-flash-lite",   // New lite model as last resort
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
