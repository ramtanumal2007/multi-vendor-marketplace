"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Star, ShieldCheck, MessageSquare, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

interface ReviewRecord {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified: boolean;
  created_at: string;
  authorName?: string;
}

interface ProductReviewsProps {
  productId: string;
  productTitle?: string;
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
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
  const supabase = createClient();

  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Review Form state
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch reviews for this product
      const { data: reviewData, error: reviewErr } = await supabase
        .from("reviews")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (reviewErr) throw reviewErr;

      if (reviewData && reviewData.length > 0) {
        // 2. Fetch author names from profiles
        const userIds = Array.from(new Set(reviewData.map((r: { user_id: string }) => r.user_id).filter(Boolean)));
        const profileMap = new Map<string, string>();

        if (userIds.length > 0) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);

          (profileData || []).forEach((p: { id: string; full_name?: string | null }) => {
            if (p.full_name) profileMap.set(p.id, p.full_name);
          });
        }

        const enriched: ReviewRecord[] = reviewData.map((r: ReviewRecord) => ({
          ...r,
          authorName: profileMap.get(r.user_id) || "Verified Shopper",
        }));

        setReviews(enriched);
      } else {
        setReviews([]);
      }
    } catch (err: unknown) {
      console.error("Error loading reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [productId, supabase]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Calculations for average & distribution
  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : null;

  const distribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
    return { star, count, percentage };
  });

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      addToast({ title: "Sign in required", description: "Please sign in to write a review.", type: "error" });
      return;
    }

    if (!reviewTitle.trim() || !reviewBody.trim()) {
      setFormError("Please provide both a title and review content.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      // Check if user has ordered this product to assign authoritative verified status
      const { data: orderMatches } = await supabase
        .from("order_items")
        .select("id, orders!inner(user_id)")
        .eq("product_id", productId)
        .eq("orders.user_id", user.id)
        .limit(1);

      const isVerifiedBuyer = Boolean(orderMatches && orderMatches.length > 0);

      const { error: insertErr } = await supabase.from("reviews").insert({
        product_id: productId,
        user_id: user.id,
        rating,
        title: reviewTitle.trim(),
        body: reviewBody.trim(),
        is_verified: isVerifiedBuyer,
      });

      if (insertErr) throw insertErr;

      addToast({ title: "Review Submitted", description: "Your feedback is now live on this product.", type: "success" });

      // Reset form
      setReviewTitle("");
      setReviewBody("");
      setRating(5);
      setIsFormOpen(false);
      fetchReviews();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to publish review.";
      setFormError(message);
      addToast({ title: "Review Error", description: message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mt-16 pt-12 border-t border-border" id="customer-reviews">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-serif font-black text-foreground tracking-tight flex items-center gap-2.5">
            <span>Customer Ratings &amp; Reviews</span>
            {totalReviews > 0 && (
              <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {totalReviews} {totalReviews === 1 ? "review" : "reviews"}
              </span>
            )}
          </h2>
          <p className="text-sm text-foreground-secondary mt-1">
            Real feedback from verified purchasers of {productTitle || "this product"}
          </p>
        </div>

        {user ? (
          <Button
            variant="outline"
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="flex items-center gap-2 self-start sm:self-auto font-bold border-2 hover:border-accent hover:text-accent"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{isFormOpen ? "Cancel Review" : "Write a Review"}</span>
          </Button>
        ) : (
          <Link href={`/login?redirect=/products/${productId}`}>
            <Button variant="outline" size="sm" className="font-semibold text-xs border-2">
              Sign In to Write a Review
            </Button>
          </Link>
        )}
      </div>

      {/* Write Review Form Card */}
      {isFormOpen && user && (
        <div className="bg-card rounded-2xl border border-accent/40 p-6 mb-10 shadow-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <Sparkles className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-base text-foreground">Share Your Experience</h3>
          </div>

          <form onSubmit={handleSubmitReview} className="space-y-4">
            {formError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Interactive Star Rating Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Overall Rating *</label>
              <div className="flex items-center gap-1.5 py-1">
                {[1, 2, 3, 4, 5].map((starVal) => {
                  const isFilled = (hoverRating !== null ? hoverRating : rating) >= starVal;
                  return (
                    <button
                      key={starVal}
                      type="button"
                      onMouseEnter={() => setHoverRating(starVal)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() => setRating(starVal)}
                      className="p-1 text-slate-300 hover:text-amber-400 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                      aria-label={`Rate ${starVal} star${starVal > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`w-7 h-7 ${
                          isFilled ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-700"
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="text-xs font-bold text-foreground ml-3 select-none">
                  {rating === 5 && "5 — Excellent"}
                  {rating === 4 && "4 — Very Good"}
                  {rating === 3 && "3 — Average"}
                  {rating === 2 && "2 — Disappointing"}
                  {rating === 1 && "1 — Poor"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Review Headline *</label>
              <input
                type="text"
                required
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="e.g. Great quality and fast local delivery!"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Written Review *</label>
              <textarea
                required
                rows={4}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="What did you like or dislike? How was the fit, material, or functionality?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting} className="font-bold shadow-xs">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...
                  </>
                ) : (
                  "Post Verified Review"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 bg-background-secondary/60 rounded-2xl animate-pulse" />
          <div className="h-24 bg-background-secondary/60 rounded-2xl animate-pulse" />
        </div>
      ) : totalReviews === 0 ? (
        /* Empty State */
        <div className="p-10 text-center bg-background-secondary/20 rounded-3xl border border-dashed border-border flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3 text-accent">
            <Star className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-foreground">No Reviews Yet</h3>
          <p className="text-xs text-foreground-secondary max-w-sm mt-1 mb-5">
            Be the first customer to share your thoughts and help others make the right decision.
          </p>
          {user ? (
            <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)}>
              Write the First Review
            </Button>
          ) : (
            <Link href={`/login?redirect=/products/${productId}`}>
              <Button variant="primary" size="sm">
                Sign In to Review
              </Button>
            </Link>
          )}
        </div>
      ) : (
        /* Summary & Reviews Breakdown Grid */
        <div className="space-y-8">
          {/* Summary Box */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Left Score */}
            <div className="flex flex-col items-center md:items-start text-center md:text-left min-w-[160px]">
              <div className="text-5xl font-black text-foreground tracking-tight">
                {averageRating}
              </div>
              <div className="flex items-center gap-1 my-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= Math.round(Number(averageRating))
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300 dark:text-slate-700"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-foreground-secondary">
                Based on {totalReviews} verified {totalReviews === 1 ? "review" : "reviews"}
              </p>
            </div>

            {/* Right Distribution Bars */}
            <div className="flex-1 w-full max-w-md space-y-2 text-xs">
              {distribution.map((d) => (
                <div key={d.star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-12 text-foreground font-semibold">
                    <span>{d.star}</span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-background-secondary overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${d.percentage}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-foreground-secondary font-mono">
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Individual Reviews List */}
          <div className="space-y-4">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="bg-card rounded-2xl border border-border/70 p-5 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= r.rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-700"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-foreground ml-1">
                        {r.rating}.0
                      </span>
                    </div>

                    {r.title && (
                      <h4 className="font-bold text-sm text-foreground leading-snug">
                        {r.title}
                      </h4>
                    )}
                  </div>

                  <span className="text-[11px] text-foreground-secondary whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </span>
                </div>

                {r.body && (
                  <p className="text-xs text-foreground-secondary leading-relaxed">
                    {r.body}
                  </p>
                )}

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-foreground-secondary">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {r.authorName || "Verified Shopper"}
                    </span>
                    {r.is_verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.2 rounded">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Verified Purchase
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
