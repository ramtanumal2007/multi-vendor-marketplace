"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  ShieldCheck,
  MessageSquare,
  AlertCircle,
  Loader2,
  Camera,
  X,
  CheckCircle2,
  Image as ImageIcon,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";
import Image from "next/image";
import Link from "next/link";

interface ReviewItem {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  imageUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string | null;
  authorName: string;
  authorFullName?: string;
}

interface DistributionItem {
  star: number;
  count: number;
  percentage: number;
}

interface ProductReviewsProps {
  productId: string;
  productTitle?: string;
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function ProductReviews({ productId, productTitle }: ProductReviewsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [userReview, setUserReview] = useState<ReviewItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Image Modal Preview State
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);

  const fetchReviewsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/reviews?productId=${productId}`);
      const data = await res.json();
      if (data && data.success) {
        setReviews(data.reviews || []);
        setTotalReviews(data.totalReviews || 0);
        setAverageRating(data.averageRating || null);
        setDistribution(data.distribution || []);
        setIsEligible(Boolean(data.isEligible));
        setUserReview(data.userReview || null);

        // Pre-fill form if user has an existing review
        if (data.userReview) {
          setRating(data.userReview.rating || 5);
          setReviewTitle(data.userReview.title || "");
          setReviewBody(data.userReview.body || "");
          setExistingImageUrl(data.userReview.imageUrl || null);
        }
      }
    } catch (err) {
      console.error("Error fetching reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviewsData();
  }, [fetchReviewsData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast({
        title: "Invalid file format",
        description: "Only JPEG, PNG, and WebP images are allowed.",
        type: "error",
      });
      return;
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      addToast({
        title: "File too large",
        description: "Image size must be less than 5MB.",
        type: "error",
      });
      return;
    }

    setSelectedFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setExistingImageUrl(null);
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    setExistingImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addToast({
        title: "Sign in required",
        description: "Please sign in to submit a review.",
        type: "error",
      });
      return;
    }

    if (!isEligible) {
      addToast({
        title: "Verified Purchase Required",
        description: "Only verified buyers who have received this product can submit a review.",
        type: "error",
      });
      return;
    }

    if (!reviewBody.trim() || reviewBody.trim().length < 3) {
      setFormError("Please enter a review description of at least 3 characters.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      let finalImageUrl = existingImageUrl;

      // Upload image if a new one was selected
      if (selectedFile) {
        setIsUploadingImage(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("productId", productId);

        const uploadRes = await fetch("/api/reviews/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.url) {
          throw new Error(uploadData.message || "Failed to upload review image.");
        }
        finalImageUrl = uploadData.url;
        setIsUploadingImage(false);
      }

      // Submit review via authoritative API
      const submitRes = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          title: reviewTitle.trim() || null,
          body: reviewBody.trim(),
          imageUrl: finalImageUrl,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitData.success) {
        throw new Error(submitData.message || "Failed to submit review.");
      }

      addToast({
        title: submitData.isUpdated ? "Review Updated" : "Verified Review Published",
        description: submitData.message,
        type: "success",
      });

      setIsFormOpen(false);
      setSelectedFile(null);
      setImagePreviewUrl(null);
      fetchReviewsData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit review.";
      setFormError(message);
      addToast({ title: "Review Error", description: message, type: "error" });
    } finally {
      setIsSubmitting(false);
      setIsUploadingImage(false);
    }
  };

  return (
    <section className="mt-16 pt-12 border-t border-slate-200" id="customer-reviews">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Customer Ratings &amp; Reviews</span>
            {totalReviews > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {totalReviews} {totalReviews === 1 ? "review" : "reviews"}
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real feedback from verified purchasers who bought {productTitle || "this product"}
          </p>
        </div>

        {/* Action Button */}
        {user ? (
          isEligible ? (
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="flex items-center gap-2 self-start sm:self-auto font-bold border-2 hover:border-blue-600 hover:text-blue-600"
            >
              {userReview ? <Edit3 className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              <span>
                {isFormOpen
                  ? "Cancel"
                  : userReview
                  ? "Edit Your Review"
                  : "Write a Verified Review"}
              </span>
            </Button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold self-start sm:self-auto">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Purchases Only</span>
            </div>
          )
        ) : (
          <Link href={`/login?redirect=/products/${productId}`}>
            <Button variant="outline" size="sm" className="font-semibold text-xs border-2">
              Sign In to Review
            </Button>
          </Link>
        )}
      </div>

      {/* Review Submission / Edit Form */}
      {isFormOpen && isEligible && (
        <form
          onSubmit={handleSubmitReview}
          className="mb-10 p-6 bg-slate-50 border border-slate-200 rounded-3xl flex flex-col gap-5 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-extrabold text-slate-900">
                {userReview ? "Edit Your Verified Review" : "Write a Verified Review"}
              </h3>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Verified Purchaser
            </span>
          </div>

          {/* Star Rating Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Rating *
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-7 h-7 ${
                      (hoverRating !== null ? hoverRating >= star : rating >= star)
                        ? "text-amber-400 fill-amber-400"
                        : "text-slate-300"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-slate-700">
                {rating === 5
                  ? "5 - Excellent"
                  : rating === 4
                  ? "4 - Very Good"
                  : rating === 3
                  ? "3 - Average"
                  : rating === 2
                  ? "2 - Poor"
                  : "1 - Terrible"}
              </span>
            </div>
          </div>

          {/* Review Title */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Headline / Title (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Excellent quality, fast delivery!"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          {/* Review Body */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Your Review *
            </label>
            <textarea
              rows={4}
              placeholder="Share what you liked, sizing fit, packaging, or durability..."
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              className="w-full p-3.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500/20 text-slate-900 resize-none"
            />
          </div>

          {/* Optional Photo Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-blue-600" /> Add Product Photo (Optional)
            </label>

            {imagePreviewUrl || existingImageUrl ? (
              <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-blue-500/40 shadow-sm group">
                <Image
                  src={imagePreviewUrl || existingImageUrl!}
                  alt="Review photo"
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                  title="Remove photo"
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
                  id="review-image-input"
                />
                <label
                  htmlFor="review-image-input"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-dashed border-slate-300 hover:border-blue-500 rounded-xl text-xs font-bold text-slate-700 hover:text-blue-600 cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <span>Choose Photo (Max 5MB • JPG, PNG, WebP)</span>
                </label>
              </div>
            )}
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || isUploadingImage}
              isLoading={isSubmitting || isUploadingImage}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {isSubmitting
                ? "Submitting..."
                : isUploadingImage
                ? "Uploading Photo..."
                : userReview
                ? "Update Verified Review"
                : "Publish Verified Review"}
            </Button>
          </div>
        </form>
      )}

      {/* Review Statistics & Rating Overview */}
      {totalReviews > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 sm:p-8 bg-slate-50/70 border border-slate-200 rounded-3xl mb-10">
          {/* Average Rating Block */}
          <div className="flex flex-col items-center justify-center md:border-r border-slate-200/80 pr-0 md:pr-6 text-center">
            <span className="text-5xl font-black text-slate-900 tracking-tight">
              {averageRating}
            </span>
            <div className="flex items-center gap-1 my-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    averageRating && averageRating >= star
                      ? "text-amber-400 fill-amber-400"
                      : averageRating && averageRating >= star - 0.5
                      ? "text-amber-400 fill-amber-400/50"
                      : "text-slate-300"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs font-bold text-slate-500">
              Based on {totalReviews} verified {totalReviews === 1 ? "review" : "reviews"}
            </span>
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>100% Verified Purchases</span>
            </div>
          </div>

          {/* Rating Distribution Bar Chart */}
          <div className="md:col-span-2 flex flex-col justify-center gap-2">
            {distribution.map((item) => (
              <div key={item.star} className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 w-12 text-slate-600 font-bold shrink-0">
                  <span>{item.star}</span>
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                </div>
                <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <span className="w-10 text-right text-slate-400 font-semibold shrink-0">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Reviews List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600 mb-2" />
          <span className="text-xs font-medium">Loading verified reviews...</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-slate-50/50 border border-dashed border-slate-300 rounded-3xl">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No customer reviews yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Be the first verified customer who bought this product to share your feedback!
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-200 border-t border-slate-200">
          {reviews.map((rev) => (
            <article key={rev.id} className="py-6 sm:py-8 flex flex-col gap-3">
              {/* Reviewer Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{rev.authorName}</span>
                    {rev.isVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Verified Purchase</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            rev.rating >= star
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-slate-300 text-xs">•</span>
                    <span className="text-xs text-slate-400">{formatDate(rev.createdAt)}</span>
                  </div>
                </div>

                {rev.rating >= 4 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" /> Recommended
                  </span>
                )}
              </div>

              {/* Review Title */}
              {rev.title && (
                <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                  {rev.title}
                </h4>
              )}

              {/* Review Body */}
              {rev.body && (
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {rev.body}
                </p>
              )}

              {/* Review Image (Optional) */}
              {rev.imageUrl && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModalImage(rev.imageUrl)}
                    className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-2xs hover:scale-105 transition-transform cursor-zoom-in"
                  >
                    <Image
                      src={rev.imageUrl}
                      alt="Customer review photo"
                      fill
                      className="object-cover"
                    />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Image Zoom Modal */}
      {activeModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setActiveModalImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] w-full h-[70vh] rounded-2xl overflow-hidden bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={activeModalImage}
              alt="Review photo enlarged"
              fill
              className="object-contain"
            />
            <button
              type="button"
              onClick={() => setActiveModalImage(null)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center transition-colors shadow-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
