"use client";

import { useState, useCallback, useRef } from "react";
import { UploadArea, QueuedFile } from "@/components/upload-area";
import { DataTable } from "@/components/data-table";
import { ExportButton } from "@/components/export-button";
import { DataRow } from "@/lib/csv-utils";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – lucide-react named export resolution issue on external drive
import { Play, Trash2, RotateCcw } from "lucide-react";

const STEPS = [
  { id: 1, label: "Upload files" },
  { id: 2, label: "AI extracts profiles" },
  { id: 3, label: "Refine & validate data" },
  { id: 4, label: "Review & export" },
];

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const headersRef = useRef<string[]>([]);

  // Add new files to the queue (deduplicate by id)
  const handleFilesQueued = useCallback((incoming: QueuedFile[]) => {
    setQueuedFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      const fresh = incoming.filter((f) => !existingIds.has(f.id));
      return [...prev, ...fresh];
    });
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setQueuedFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  // Process a single file and return extracted rows
  const processFile = async (qf: QueuedFile): Promise<DataRow[]> => {
    const formData = new FormData();
    formData.append("file", qf.file);
    const response = await fetch("/api/extract", { method: "POST", body: formData });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Extraction failed");
    }
    const data = await response.json();
    if (headersRef.current.length === 0 && data.headers?.length > 0) {
      headersRef.current = data.headers;
      setHeaders(data.headers);
    }
    const extractedRows = (data.rows as DataRow[]) ?? [];
    if (extractedRows.length === 0) {
      throw new Error("No matrimonial profiles found in this file");
    }
    return extractedRows;
  };

  const handleProcessAll = async () => {
    const pending = queuedFiles.filter((f) => f.status === "pending");
    if (pending.length === 0) {
      toast.error("No pending files to process");
      return;
    }

    setIsProcessing(true);
    setCurrentStep(2);
    setTotalToProcess(pending.length);
    setProcessedCount(0);

    // Mark all pending as "processing"
    setQueuedFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "processing" as const } : f
      )
    );

    let successCount = 0;
    let failCount = 0;
    const allNewRows: DataRow[] = [];

    // Process sequentially to avoid hammering the API
    for (const qf of pending) {
      setCurrentStep(3);
      try {
        const extracted = await processFile(qf);
        allNewRows.push(...extracted);
        successCount++;
        setQueuedFiles((prev) =>
          prev.map((f) => (f.id === qf.id ? { ...f, status: "done" as const } : f))
        );
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : "Failed";
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === qf.id ? { ...f, status: "error" as const, error: msg } : f
          )
        );
        console.error(`[extract] Failed for ${qf.file.name}:`, err);
      }
      setProcessedCount((c) => c + 1);
    }

    // Merge new rows with any existing rows
    setRows((prev) => [...prev, ...allNewRows]);
    setCurrentStep(4);
    setIsProcessing(false);

    if (successCount > 0 && failCount === 0) {
      toast.success(`✅ ${allNewRows.length} profile${allNewRows.length !== 1 ? "s" : ""} extracted from ${successCount} file${successCount !== 1 ? "s" : ""}`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`⚠️ ${allNewRows.length} profiles extracted — ${failCount} file${failCount !== 1 ? "s" : ""} failed`);
    } else {
      toast.error("All files failed to extract. Please try again.");
      setCurrentStep(1);
    }
  };

  const handleRowsChange = (newRows: DataRow[]) => setRows(newRows);

  const handleClearAll = () => {
    queuedFiles.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setQueuedFiles([]);
    setHeaders([]);
    setRows([]);
    headersRef.current = [];
    setCurrentStep(1);
    setProcessedCount(0);
    setTotalToProcess(0);
    toast.success("Cleared everything");
  };

  const handleClearResults = () => {
    setRows([]);
    headersRef.current = [];
    setHeaders([]);
    toast.success("Results cleared — files still queued");
  };

  const pendingCount = queuedFiles.filter((f) => f.status === "pending").length;
  const errorFiles = queuedFiles.filter((f) => f.status === "error");

  // Retry only errored files
  const handleRetryFailed = () => {
    setQueuedFiles((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "pending" as const, error: undefined } : f))
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-3xl">💍</span>
            <h1 className="text-4xl font-bold text-gray-900">Nikah Sufiyana</h1>
          </div>
          <p className="text-lg text-gray-500 font-medium">
            Matrimonial Database Extraction &amp; Refinement Engine
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Upload one or more newspaper matrimonial images → AI extracts, cleans &amp; validates every profile into one sheet
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
          {/* Upload + Queue */}
          <div className="rounded-xl bg-white p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">File Queue</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add images or WhatsApp text exports — all profiles land in one sheet
                </p>
              </div>
              {queuedFiles.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={isProcessing}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Clear All
                </Button>
              )}
            </div>

            <UploadArea
              onFilesQueued={handleFilesQueued}
              queuedFiles={queuedFiles}
              onRemoveFile={handleRemoveFile}
              isLoading={isProcessing}
            />

            {/* Process button + progress */}
            {pendingCount > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={handleProcessAll}
                  disabled={isProcessing}
                  className="bg-rose-500 hover:bg-rose-600 text-white"
                >
                  {isProcessing ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Processing {processedCount} / {totalToProcess}…
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Extract {pendingCount} File{pendingCount !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
                {isProcessing && (
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-rose-400 transition-all duration-500 rounded-full"
                      style={{ width: `${totalToProcess > 0 ? (processedCount / totalToProcess) * 100 : 0}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Retry failed */}
            {errorFiles.length > 0 && !isProcessing && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryFailed}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Retry {errorFiles.length} Failed File{errorFiles.length !== 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </div>

          {/* Results Table */}
          {rows.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-md border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Refined Profiles</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {rows.length} profile{rows.length !== 1 ? "s" : ""} · cleaned · validated · tagged
                    {queuedFiles.filter(f => f.status === "done").length > 0 && (
                      <span className="ml-1 text-gray-400">
                        from {queuedFiles.filter(f => f.status === "done").length} file{queuedFiles.filter(f => f.status === "done").length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ExportButton headers={headers} rows={rows} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearResults}
                    disabled={isProcessing}
                    className="text-gray-500 hover:text-red-500"
                  >
                    Clear Results
                  </Button>
                </div>
              </div>
              <DataTable headers={headers} rows={rows} onRowsChange={handleRowsChange} />
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-10 rounded-xl bg-gradient-to-r from-rose-50 to-emerald-50 border border-rose-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-3">🔍 How it works</h3>
          <div className="grid gap-2 sm:grid-cols-2 text-sm text-gray-600">
            <div className="flex gap-2"><span className="font-bold text-rose-500">1.</span><span>Upload newspaper images and/or WhatsApp .txt exports</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">2.</span><span>Click "Extract" — Gemini AI processes each file in sequence</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">3.</span><span>All profiles are merged into a single refined &amp; tagged sheet</span></div>
            <div className="flex gap-2"><span className="font-bold text-rose-500">4.</span><span>Review, edit, then export as one clean CSV file</span></div>
          </div>
        </div>
      </div>
    </main>
  );
}
