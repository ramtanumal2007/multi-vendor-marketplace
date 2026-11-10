"use client";

import React, { useState } from "react";
import { Upload, X, Star, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { optimizeProductImage, formatBytes, VALIDATION_HELPER_TEXT, MAX_IMAGE_COUNT } from "@/lib/imageOptimizer";

export interface UploadedImageItem {
  id?: string;
  url: string;
  file?: File;
  isExisting?: boolean;
  originalSize?: number;
  optimizedSize?: number;
  savingsPercentage?: number;
}

interface ImageUploaderProps {
  images: UploadedImageItem[];
  onChange: (images: UploadedImageItem[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export function ImageUploader({
  images,
  onChange,
  maxImages = MAX_IMAGE_COUNT,
  disabled = false,
}: ImageUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setErrorMessage(null);

    const selectedFiles = Array.from(e.target.files);
    const availableSlots = maxImages - images.length;

    if (availableSlots <= 0) {
      setErrorMessage(`Maximum limit of ${maxImages} images reached.`);
      return;
    }

    const filesToProcess = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > availableSlots) {
      setErrorMessage(`Only ${availableSlots} more image(s) can be added (max ${maxImages}).`);
    }

    setIsProcessing(true);

    const newOptimizedImages: UploadedImageItem[] = [];

    for (const file of filesToProcess) {
      try {
        const result = await optimizeProductImage(file);
        newOptimizedImages.push({
          url: result.previewUrl,
          file: result.file,
          isExisting: false,
          originalSize: result.originalSize,
          optimizedSize: result.optimizedSize,
          savingsPercentage: result.savingsPercentage,
        });
      } catch (err: unknown) {
        console.error("Optimization error:", err);
        setErrorMessage((err as Error).message || "Failed to process selected image.");
        break;
      }
    }

    if (newOptimizedImages.length > 0) {
      onChange([...images, ...newOptimizedImages]);
    }

    setIsProcessing(false);
    // Reset file input value
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleMove = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChange(updated);
  };

  return (
    <div className="space-y-3 w-full">
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span className="font-medium text-slate-700">Product Images ({images.length}/{maxImages})</span>
        <span>{VALIDATION_HELPER_TEXT}</span>
      </div>

      {errorMessage && (
        <div className="bg-red-50 text-red-600 border border-red-200 text-xs p-2.5 rounded-lg flex items-center justify-between">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid of images + dropzone */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {images.map((img, index) => (
          <div
            key={img.url + index}
            className={`group relative aspect-square bg-slate-100 rounded-xl overflow-hidden border transition-all ${
              index === 0 ? "border-accent ring-2 ring-accent/20" : "border-slate-200"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Product ${index + 1}`} className="object-cover w-full h-full" />

            {/* Cover Badge */}
            {index === 0 ? (
              <div className="absolute top-2 left-2 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-3 h-3 fill-current" /> COVER
              </div>
            ) : (
              <div className="absolute top-2 left-2 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                #{index + 1}
              </div>
            )}

            {/* Optimization Stats Badge */}
            {!img.isExisting && img.optimizedSize && (
              <div className="absolute bottom-2 left-2 right-2 bg-slate-900/80 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded text-center truncate">
                WebP • {formatBytes(img.optimizedSize)}
                {img.savingsPercentage ? ` (-${img.savingsPercentage}%)` : ""}
              </div>
            )}

            {/* Action Overlay */}
            {!disabled && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMove(index, "left")}
                    className="p-1.5 bg-white/90 rounded-full text-slate-700 hover:text-accent hover:bg-white transition"
                    title="Move Left"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1.5 bg-white/90 rounded-full text-slate-700 hover:text-red-600 hover:bg-white transition"
                  title="Remove Image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {index < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMove(index, "right")}
                    className="p-1.5 bg-white/90 rounded-full text-slate-700 hover:text-accent hover:bg-white transition"
                    title="Move Right"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Dropzone Card */}
        {images.length < maxImages && !disabled && (
          <label className="relative aspect-square border-2 border-dashed border-slate-300 hover:border-accent hover:bg-blue-50/50 rounded-xl flex flex-col justify-center items-center cursor-pointer transition-colors p-2 text-center group">
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              multiple
              disabled={isProcessing}
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            {isProcessing ? (
              <div className="flex flex-col items-center gap-1 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <span className="text-[10px] font-medium mt-1">Optimizing...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-500 group-hover:text-accent transition-colors">
                <Upload className="w-6 h-6" />
                <span className="text-[11px] font-medium">Add Images</span>
                <span className="text-[9px] text-slate-400">Select files</span>
              </div>
            )}
          </label>
        )}
      </div>
    </div>
  );
}
