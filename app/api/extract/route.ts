import { NextRequest, NextResponse } from "next/server";
import { extractDataFromImage, extractDataFromText } from "@/lib/gemini-client";
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

    const buffer = await file.arrayBuffer();
    const isImage = file.type.startsWith("image/");
    const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
    let csvContent = "";

    if (isImage) {
      const base64 = Buffer.from(buffer).toString("base64");
      csvContent = await extractDataFromImage(base64, file.type);
    } else if (isText) {
      const textContent = Buffer.from(buffer).toString("utf8");
      csvContent = await extractDataFromText(textContent);
    } else {
      return NextResponse.json(
        { error: "File must be an image or .txt text export" },
        { status: 400 }
      );
    }

    const { headers: rawHeaders, rows: rawRows } = parseCSV(csvContent);

    if (rawHeaders.length === 0) {
      return NextResponse.json(
        {
          error: isText
            ? "No matrimonial profiles found in this text file"
            : "No data could be extracted from the image",
        },
        { status: 400 }
      );
    }

    // Client-side normalization pass
    const normalizedRows = normalizeDataRows(rawRows);
    if (normalizedRows.length === 0) {
      return NextResponse.json(
        {
          error: isText
            ? "No matrimonial profiles found in this text file"
            : "No profiles could be extracted from the image",
        },
        { status: 400 }
      );
    }

    // Always return canonical matrimonial headers
    const headers = [...MATRIMONIAL_HEADERS];

    return NextResponse.json({
      headers,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
    });
  } catch (error) {
    console.error("[v0] API Error:", error);
    const msg = error instanceof Error ? error.message : "Failed to extract data";
    const isOverloaded =
      msg.includes("503") ||
      msg.includes("Service Unavailable") ||
      msg.includes("high demand") ||
      msg.includes("overloaded");
    return NextResponse.json(
      {
        error: isOverloaded
          ? "Gemini AI is currently overloaded. Please wait a moment and try again."
          : msg,
      },
      { status: 500 }
    );
  }
}
