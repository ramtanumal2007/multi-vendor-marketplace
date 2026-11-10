"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { Star, Camera, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export interface ReviewTargetItem {
  productId: string;
  productTitle: string;
  orderId?: string;
  orderNumber?: string;
  imageUrl?: string;
  existingReview?: {
    id: string;
    rating: number;
    title?: string | null;
    body?: string | null;
    image_url?: string | null;
  } | null;
}

interface WriteReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: ReviewTargetItem | null;
  onSuccess?: (reviewData: { rating: number; title?: string; body: string }) => void;
}

export function WriteReviewModal({
  isOpen,
  onClose,
  target,
  onSuccess,
}: WriteReviewModalProps) {
  const { addToast } = useToast();

  const [rating, setRating] = useState<number>(target?.existingReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [title, setTitle] = useState<string>(target?.existingReview?.title || "");
  const [bodyText, setBodyText] = useState<string>(target?.existingReview?.body || "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(
    target?.existingReview?.image_url || null
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when target changes
  React.useEffect(() => {
    if (target) {
      setRating(target.existingReview?.rating || 5);
      setTitle(target.existingReview?.title || "");
      setBodyText(target.existingReview?.body || "");
      setExistingImageUrl(target.existingReview?.image_url || null);
      setImageFile(null);
      setImagePreview(null);
      setError(null);
    }
  }, [target]);

  if (!isOpen || !target) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast({
        title: "Invalid file format",
        description: "Only JPEG, PNG, and WebP images are allowed.",
        type: "error",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast({
        title: "File too large",
        description: "Image size must be less than 5MB.",
        type: "error",
      });
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setExistingImageUrl(null);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    setExistingImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!bodyText.trim() || bodyText.trim().length < 3) {
      setError("Please write at least 3 characters in your review.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let uploadedImageUrl = existingImageUrl;

      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        formData.append("productId", target.productId);

        const uploadRes = await fetch("/api/reviews/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.message || "Failed to upload review image.");
        }
        uploadedImageUrl = uploadData.publicUrl;
      }

      const submitRes = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: target.productId,
          rating,
          title: title.trim() || undefined,
          body: bodyText.trim(),
          imageUrl: uploadedImageUrl || undefined,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok || !submitData.success) {
        throw new Error(submitData.message || "Failed to submit review.");
      }

      addToast({
        title: target.existingReview ? "Review Updated" : "Review Published",
        description: submitData.message || "Thank you! Your verified purchase review has been published.",
        type: "success",
      });

      if (onSuccess) {
        onSuccess({ rating, title: title.trim() || undefined, body: bodyText.trim() });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoverRating !== null ? hoverRating : rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-background-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-foreground leading-tight">
                {target.existingReview ? "Edit Verified Review" : "Write Product Review"}
              </h3>
              <p className="text-xs text-foreground-secondary truncate max-w-[280px]">
                {target.productTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-background-secondary flex items-center justify-center text-foreground-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Rating Stars */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-2">
              Overall Rating
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 hover:scale-110 transition-transform focus:outline-none"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= displayRating
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300 dark:text-slate-700"
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-foreground ml-2">
                {displayRating} of 5 Stars
              </span>
            </div>
          </div>

          {/* Review Title */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Headline / Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Outstanding quality, highly recommended!"
              maxLength={150}
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Review Body */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Your Review <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Share your genuine feedback on product quality, fit, finish, or delivery..."
              required
              minLength={3}
              className="w-full p-3 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Photo Attachment */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1.5">
              Add Photo (Optional)
            </label>

            {imagePreview || existingImageUrl ? (
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-border">
                <Image
                  src={imagePreview || existingImageUrl || ""}
                  alt="Review preview"
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  id="review-image-upload"
                />
                <label
                  htmlFor="review-image-upload"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-border hover:bg-background-secondary text-xs font-semibold text-foreground cursor-pointer transition-colors"
                >
                  <Camera className="w-4 h-4 text-foreground-secondary" />
                  <span>Upload a photo (Max 5MB)</span>
                </label>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-bold gap-1.5"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{target.existingReview ? "Update Review" : "Publish Review"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
