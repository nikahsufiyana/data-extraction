"use client";

import { useState } from "react";
import { UploadArea } from "@/components/upload-area";
import { DataTable } from "@/components/data-table";
import { ExportButton } from "@/components/export-button";
import { DataRow } from "@/lib/csv-utils";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

const STEPS = [
  { id: 1, label: "Upload image" },
  { id: 2, label: "AI extracts profiles" },
  { id: 3, label: "Refine & validate data" },
  { id: 4, label: "Review & export" },
];

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [statusMsg, setStatusMsg] = useState("");

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setCurrentStep(2);
    setStatusMsg("Extracting profiles from image…");
    try {
      const formData = new FormData();
      formData.append("file", file);

      setCurrentStep(3);
      setStatusMsg("Cleaning, validating & tagging data…");

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to extract data");
      }

      const data = await response.json();
      setHeaders(data.headers);
      setRows(data.rows);
      setCurrentStep(4);
      setStatusMsg("");
      toast.success(`✅ ${data.rowCount} profile${data.rowCount !== 1 ? "s" : ""} extracted & refined`);
    } catch (error) {
      console.error("[v0] Error:", error);
      setCurrentStep(1);
      setStatusMsg("");
      toast.error(
        error instanceof Error ? error.message : "Failed to extract data"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowsChange = (newRows: DataRow[]) => {
    setRows(newRows);
  };

  const handleClear = () => {
    setHeaders([]);
    setRows([]);
    setCurrentStep(1);
    toast.success("Data cleared");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-3xl">💍</span>
            <h1 className="text-4xl font-bold text-gray-900">
              Nikah Sufiyana
            </h1>
          </div>
          <p className="text-lg text-gray-500 font-medium">
            Matrimonial Database Extraction &amp; Refinement Engine
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Upload newspaper matrimonial images → AI extracts, cleans &amp; validates every profile
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-center gap-0">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    currentStep > step.id
                      ? "bg-emerald-500 text-white"
                      : currentStep === step.id
                      ? "bg-rose-500 text-white ring-4 ring-rose-200"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {currentStep > step.id ? "✓" : step.id}
                </div>
                <span
                  className={`mt-1 text-xs whitespace-nowrap ${
                    currentStep >= step.id ? "text-gray-700 font-medium" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mb-4 h-0.5 w-12 sm:w-20 mx-1 transition-all ${
                    currentStep > step.id ? "bg-emerald-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {rows.length === 0 ? (
            <div className="space-y-4">
              <UploadArea onFileSelect={handleFileSelect} isLoading={isLoading} />
              {isLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-4 text-gray-600">
                  <Spinner />
                  <span className="text-sm font-medium">{statusMsg}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-6 shadow-md border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Refined Profiles
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {rows.length} profile{rows.length !== 1 ? "s" : ""} · cleaned · validated · tagged
                  </p>
                </div>
                <div className="flex gap-3">
                  <ExportButton headers={headers} rows={rows} />
                  <Button onClick={handleClear} variant="secondary">
                    Clear
                  </Button>
                </div>
              </div>
              <DataTable
                headers={headers}
                rows={rows}
                onRowsChange={handleRowsChange}
              />
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-md border border-gray-100">
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Upload Another Image
              </h3>
              <UploadArea onFileSelect={handleFileSelect} isLoading={isLoading} />
              {isLoading && (
                <div className="mt-4 flex flex-col items-center justify-center gap-2 text-gray-600">
                  <Spinner />
                  <span className="text-sm font-medium">{statusMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-10 rounded-xl bg-gradient-to-r from-rose-50 to-emerald-50 border border-rose-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-3">🔍 How it works</h3>
          <div className="grid gap-2 sm:grid-cols-2 text-sm text-gray-600">
            <div className="flex gap-2"><span className="font-bold text-rose-500">1.</span><span>Upload a newspaper matrimonial image</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">2.</span><span>Gemini AI extracts every profile into rows</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">3.</span><span>Data is refined: gender, age, height, profession, location, sect, contacts normalized</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">4.</span><span>Profiles are tagged (Urgent, NRI, Doctor, Engineer…) and exported as CSV</span></div>
          </div>
        </div>
      </div>
    </main>
  );
}
