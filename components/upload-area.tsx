"use client";

import { useRef, useState, useCallback } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – lucide-react named export resolution issue on external drive
import { Upload, X, CheckCircle2, Loader2, AlertCircle, ImagePlus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface QueuedFile {
  id: string;
  file: File;
  preview?: string;
  kind: "image" | "text";
  status: "pending" | "processing" | "done" | "error";
  error?: string;
}

interface UploadAreaProps {
  onFilesQueued: (files: QueuedFile[]) => void;
  queuedFiles: QueuedFile[];
  onRemoveFile: (id: string) => void;
  isLoading: boolean;
}

export function UploadArea({ onFilesQueued, queuedFiles, onRemoveFile, isLoading }: UploadAreaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid: QueuedFile[] = [];
      const arr = Array.from(incoming);
      for (const file of arr) {
        const isImage = file.type.startsWith("image/");
        const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
        if (!isImage && !isText) {
          toast.error(`"${file.name}" is not an image or text file — skipped`);
          continue;
        }
        valid.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          preview: isImage ? URL.createObjectURL(file) : undefined,
          kind: isImage ? "image" : "text",
          status: "pending",
        });
      }
      if (valid.length > 0) onFilesQueued(valid);
    },
    [onFilesQueued]
  );

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files?.length) {
      addFiles(e.currentTarget.files);
      // reset so same file can be re-added
      e.currentTarget.value = "";
    }
  };

  const hasPending = queuedFiles.some((f) => f.status === "pending");

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
          isDragActive
            ? "border-rose-400 bg-rose-50"
            : "border-gray-300 bg-gray-50 hover:border-rose-300 hover:bg-rose-50/40"
        }`}
        onClick={() => !isLoading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.txt,text/plain"
          multiple
          onChange={handleInputChange}
          disabled={isLoading}
          className="hidden"
        />
        <div className="w-full p-8 text-center select-none">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
            <ImagePlus className="h-7 w-7 text-rose-500" />
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">
            {isDragActive ? "Drop files here…" : "Drag & drop images or .txt files"}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            You can select <span className="font-semibold text-rose-500">multiple files</span> at once — all profiles go into one sheet
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="border-rose-300 text-rose-600 hover:bg-rose-50"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          >
            <Upload className="mr-2 h-4 w-4" />
            {queuedFiles.length > 0 ? "Add More Files" : "Select Files"}
          </Button>
        </div>
      </div>

      {/* Thumbnail Queue */}
      {queuedFiles.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">
              {queuedFiles.length} file{queuedFiles.length !== 1 ? "s" : ""} queued
              {" · "}
              <span className="text-emerald-600">{queuedFiles.filter(f => f.status === "done").length} done</span>
              {queuedFiles.some(f => f.status === "error") && (
                <span className="text-red-500"> · {queuedFiles.filter(f => f.status === "error").length} failed</span>
              )}
            </p>
            {hasPending && !isLoading && (
              <span className="text-xs text-gray-400">{queuedFiles.filter(f => f.status === "pending").length} pending</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {queuedFiles.map((qf) => (
              <div key={qf.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50">
                {/* Thumbnail */}
                {qf.kind === "image" && qf.preview ? (
                  <img
                    src={qf.preview}
                    alt={qf.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-gray-500 px-2 text-center">
                    <FileText className="h-8 w-8 text-rose-400" />
                    <span className="text-[10px] leading-tight break-words">{qf.file.name}</span>
                  </div>
                )}

                {/* Overlay for status */}
                <div className={`absolute inset-0 flex items-center justify-center transition-all ${
                  qf.status === "processing" ? "bg-black/40" :
                  qf.status === "done" ? "bg-emerald-500/20" :
                  qf.status === "error" ? "bg-red-500/20" :
                  "bg-black/0"
                }`}>
                  {qf.status === "processing" && (
                    <Loader2 className="h-7 w-7 text-white animate-spin drop-shadow" />
                  )}
                  {qf.status === "done" && (
                    <CheckCircle2 className="h-7 w-7 text-emerald-500 drop-shadow" />
                  )}
                  {qf.status === "error" && (
                    <span title={qf.error}>
                      <AlertCircle className="h-7 w-7 text-red-500 drop-shadow" />
                    </span>
                  )}
                </div>

                {/* Remove button — only for pending/error */}
                {(qf.status === "pending" || qf.status === "error") && !isLoading && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(qf.id); }}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                )}

                {/* Filename tooltip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{qf.file.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
