"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function UploadArea({ onFileSelect, isLoading }: UploadAreaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        onFileSelect(file);
      } else {
        toast.error("Please upload an image file");
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
        isDragActive
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 bg-gray-50 hover:border-gray-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        disabled={isLoading}
        className="hidden"
      />

      <div className="w-full p-8 text-center">
        <Upload className="mx-auto mb-3 h-12 w-12 text-gray-400" />
        <p className="text-lg font-semibold text-gray-700 mb-1">
          Drag and drop your image here
        </p>
        <p className="text-sm text-gray-500 mb-4">
          or click to select a file
        </p>
        <Button
          type="button"
          disabled={isLoading}
          onClick={() => inputRef.current?.click()}
        >
          {isLoading ? "Processing..." : "Select Image"}
        </Button>
      </div>
    </div>
  );
}
