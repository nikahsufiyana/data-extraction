"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataRow, exportToCSV } from "@/lib/csv-utils";

interface ExportButtonProps {
  headers: string[];
  rows: DataRow[];
  fileName?: string;
}

export function ExportButton({
  headers,
  rows,
  fileName = "data.csv",
}: ExportButtonProps) {
  const handleExport = () => {
    const csvContent = exportToCSV(headers, rows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button
      onClick={handleExport}
      variant="outline"
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}
