export interface DataRow {
  [key: string]: string;
}

// Canonical column count — used for row repair
const EXPECTED_COLUMN_COUNT = 13; // Name + 12 original columns

export function parseCSV(csvContent: string): {
  headers: string[];
  rows: DataRow[];
} {
  const lines = csvContent.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse headers from first line
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    // If the row has fewer values than headers, try to repair it
    const repaired = values.length < headers.length
      ? repairCollapsedRow(values, headers.length)
      : values;

    const row: DataRow = {};
    headers.forEach((header, index) => {
      row[header] = repaired[index] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Attempts to repair a row where multiple fields got collapsed into one cell.
 *
 * Example of broken row (12 headers, but data collapsed into ~3 cells):
 *   ["Boy", "29", "5'8,MBA,,Australia,Unmarried,,,Well settled family", "", ...]
 *
 * Strategy: find the cell that has multiple comma-separated sub-values and
 * expand it to fill the missing columns.
 */
function repairCollapsedRow(values: string[], expectedCount: number): string[] {
  const missing = expectedCount - values.length;
  if (missing <= 0) return values;

  // Find the cell with the most commas (the collapsed one)
  let bestIdx = -1;
  let bestCount = 0;
  for (let i = 0; i < values.length; i++) {
    const commas = (values[i].match(/,/g) || []).length;
    if (commas > bestCount) {
      bestCount = commas;
      bestIdx = i;
    }
  }

  if (bestIdx === -1 || bestCount === 0) {
    // Nothing to expand — pad with empty strings
    return [...values, ...Array(missing).fill("")];
  }

  // Split the collapsed cell into sub-fields, expanding exactly `missing+1` slots
  const sub = values[bestIdx].split(",").map((s) => s.trim());
  const expanded = sub.slice(0, missing + 1);
  // If not enough sub-fields, pad them
  while (expanded.length < missing + 1) expanded.push("");

  const result = [
    ...values.slice(0, bestIdx),
    ...expanded,
    ...values.slice(bestIdx + 1),
  ];

  // Recursively repair if still short
  return result.length < expectedCount
    ? repairCollapsedRow(result, expectedCount)
    : result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function exportToCSV(headers: string[], rows: DataRow[]): string {
  const csvLines: string[] = [];

  // Add headers
  csvLines.push(headers.map((h) => escapeCSVValue(h)).join(","));

  // Add rows
  rows.forEach((row) => {
    const values = headers.map((header) => escapeCSVValue(row[header] || ""));
    csvLines.push(values.join(","));
  });

  return csvLines.join("\n");
}

function escapeCSVValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
