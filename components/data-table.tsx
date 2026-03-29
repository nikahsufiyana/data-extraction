"use client";

import { useState, useCallback } from "react";
import { DataRow } from "@/lib/csv-utils";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DataTableProps {
  headers: string[];
  rows: DataRow[];
  onRowsChange: (rows: DataRow[]) => void;
}

/** Colour map for individual tags */
const TAG_COLOURS: Record<string, string> = {
  Urgent: "bg-red-100 text-red-700",
  NRI: "bg-purple-100 text-purple-700",
  Dubai: "bg-yellow-100 text-yellow-700",
  KSA: "bg-orange-100 text-orange-700",
  USA: "bg-blue-100 text-blue-700",
  UK: "bg-indigo-100 text-indigo-700",
  Australia: "bg-cyan-100 text-cyan-700",
  Canada: "bg-teal-100 text-teal-700",
  Doctor: "bg-green-100 text-green-700",
  Engineer: "bg-emerald-100 text-emerald-700",
  "Software Engineer": "bg-emerald-100 text-emerald-700",
  "Government Job": "bg-sky-100 text-sky-700",
  Business: "bg-amber-100 text-amber-700",
  Divorced: "bg-pink-100 text-pink-700",
  Widow: "bg-rose-100 text-rose-700",
  "Second Marriage": "bg-rose-100 text-rose-700",
};

function TagBadges({ value }: { value: string }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            TAG_COLOURS[tag] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/** Column width hints */
const COLUMN_WIDTHS: Record<string, string> = {
  Name: "w-28",
  Gender: "w-16",
  Age: "w-14",
  Height: "w-16",
  Education: "w-28",
  Profession: "w-32",
  Location: "w-24",
  "Marital Status": "w-28",
  Sect: "w-28",
  "Family Details": "w-44",
  Requirements: "w-52",
  "Contact Numbers": "w-48",
  Tags: "w-52",
};

export function DataTable({ headers, rows, onRowsChange }: DataTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleCellClick = (rowIndex: number, column: string) => {
    setEditingCell({ rowIndex, column });
    setEditValue(rows[rowIndex][column] || "");
  };

  const handleCellBlur = () => {
    if (editingCell) {
      const newRows = [...rows];
      newRows[editingCell.rowIndex] = {
        ...newRows[editingCell.rowIndex],
        [editingCell.column]: editValue,
      };
      onRowsChange(newRows);
    }
    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleCellBlur();
    else if (e.key === "Escape") { setEditingCell(null); setEditValue(""); }
  };

  const deleteRow = useCallback(
    (rowIndex: number) => onRowsChange(rows.filter((_, i) => i !== rowIndex)),
    [rows, onRowsChange]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-400">No profiles to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="w-10 px-3 py-3 text-center" />
            {headers.map((header) => (
              <th
                key={header}
                className={`px-3 py-3 text-left font-semibold text-gray-700 whitespace-nowrap ${
                  COLUMN_WIDTHS[header] ?? "w-32"
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={`border-b border-gray-100 transition-colors ${
                rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/50"
              } hover:bg-blue-50/40`}
            >
              <td className="px-3 py-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteRow(rowIndex)}
                  className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
              {headers.map((header) => (
                <td key={`${rowIndex}-${header}`} className="px-3 py-2 align-top">
                  {editingCell?.rowIndex === rowIndex && editingCell?.column === header ? (
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleCellBlur}
                      onKeyDown={handleKeyDown}
                      className="h-7 text-sm border-blue-400 focus:ring-blue-400"
                    />
                  ) : header === "Tags" ? (
                    <div
                      onClick={() => handleCellClick(rowIndex, header)}
                      className="cursor-pointer rounded hover:bg-blue-50 p-1 min-h-7"
                    >
                      <TagBadges value={row[header] || ""} />
                    </div>
                  ) : header === "Gender" ? (
                    <div
                      onClick={() => handleCellClick(rowIndex, header)}
                      className={`cursor-pointer rounded px-2 py-1 text-center font-medium text-xs inline-block ${
                        row[header] === "Boy"
                          ? "bg-blue-100 text-blue-700"
                          : row[header] === "Girl"
                          ? "bg-pink-100 text-pink-700"
                          : "text-gray-400"
                      }`}
                    >
                      {row[header] || "—"}
                    </div>
                  ) : (
                    <div
                      onClick={() => handleCellClick(rowIndex, header)}
                      className="cursor-pointer rounded px-1 py-1 hover:bg-blue-50 min-h-7 flex items-start text-gray-700 leading-snug"
                    >
                      {row[header] || <span className="text-gray-300">—</span>}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
