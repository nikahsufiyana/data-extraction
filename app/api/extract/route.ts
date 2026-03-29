import { NextRequest, NextResponse } from "next/server";
import { extractDataFromImage } from "@/lib/gemini-client";
import { parseCSV } from "@/lib/csv-utils";
import { normalizeDataRows, MATRIMONIAL_HEADERS } from "@/lib/data-validator";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Two-pass: extract + AI-refine via Gemini, then client-side normalize
    const csvContent = await extractDataFromImage(base64, file.type);

    const { headers: rawHeaders, rows: rawRows } = parseCSV(csvContent);

    if (rawHeaders.length === 0) {
      return NextResponse.json(
        { error: "No data could be extracted from the image" },
        { status: 400 }
      );
    }

    // Client-side normalization pass
    const normalizedRows = normalizeDataRows(rawRows);

    // Always return canonical matrimonial headers
    const headers = [...MATRIMONIAL_HEADERS];

    return NextResponse.json({
      headers,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
    });
  } catch (error) {
    console.error("[v0] API Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract data",
      },
      { status: 500 }
    );
  }
}
