"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Check,
  X,
  ArrowLeft,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();

  // Guard: Verify user has an authenticated recovery session
  useEffect(() => {
    let isMounted = true;
    async function verifyRecoverySession() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (data?.user && !error) {
          setHasValidSession(true);
          setSessionUser(data.user.email || null);
        } else {
          setHasValidSession(false);
          setSessionUser(null);
        }
      } catch {
        if (isMounted) {
          setHasValidSession(false);
          setSessionUser(null);
        }
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    verifyRecoverySession();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const isMinLength = password.length >= 6;
  const isMatching = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const isFormValid = isMinLength && isMatching && !isLoading;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!password) {
      addToast({ title: "Validation Error", description: "Please enter a new password.", type: "error" });
      return;
    }

    if (password.length < 6) {
      addToast({ title: "Validation Error", description: "Password must be at least 6 characters long.", type: "error" });
      return;
    }

    if (password !== confirmPassword) {
      addToast({ title: "Validation Error", description: "Passwords do not match.", type: "error" });
      return;
    }

    setIsLoading(true);

    try {
      // Re-verify session before executing password change
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) {
        setHasValidSession(false);
        setIsLoading(false);
        addToast({
          title: "Session Expired",
          description: "Your recovery session has expired. Please request a new recovery code.",
          type: "error",
        });
        return;
      }

      // Authoritatively update password in Supabase Auth
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        addToast({ title: "Reset Failed", description: error.message, type: "error" });
        setIsLoading(false);
      } else {
        // Sign out recovery session so user starts fresh with new credentials
        try {
          await supabase.auth.signOut();
        } catch {
          // Non-blocking cleanup
        }

        setIsSuccess(true);
        setPassword("");
        setConfirmPassword("");
        setIsLoading(false);
        addToast({
          title: "Password Updated Successfully 🎉",
          description: "Your new password has been saved. Please sign in with your new credentials.",
          type: "success",
        });
      }
    } catch (err: any) {
      setIsLoading(false);
      addToast({
        title: "Unexpected Error",
        description: err?.message || "Failed to update password. Please try again.",
        type: "error",
      });
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6 w-full">
      <div className="w-full max-w-[460px] mx-auto">
        {/* Minimal VENDOSMITH Branding Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
            <span className="text-2xl sm:text-3xl font-black tracking-wider text-foreground font-sans">
              VENDO<span className="text-accent">SMITH</span>
            </span>
          </Link>
        </div>

        {/* Card Container */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm sm:shadow-md transition-all">
          {isCheckingSession ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-xs sm:text-sm text-foreground-secondary font-medium">
                Verifying recovery session...
              </p>
            </div>
          ) : !hasValidSession ? (
            /* Unauthorized / Expired Session State */
            <div className="flex flex-col items-center text-center gap-5 py-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-1.5">
                  No Active Recovery Session
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary leading-relaxed">
                  You must request a 6-digit password recovery code from the sign in page and verify it before setting a new password.
                </p>
              </div>
              <div className="flex flex-col gap-2.5 w-full pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => router.push("/login")}
                  className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
                </Button>
                <Link
                  href="/seller/login"
                  className="text-xs font-semibold text-foreground-secondary hover:text-foreground text-center transition-colors"
                >
                  Go to Seller Hub Sign In
                </Link>
              </div>
            </div>
          ) : isSuccess ? (
            /* Success State */
            <div className="flex flex-col items-center text-center gap-6 py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">
                  Password Updated Successfully
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary leading-relaxed">
                  Your password has been changed. Your old password will no longer work. You can now sign in with your new credentials.
                </p>
              </div>
              <div className="flex flex-col gap-2.5 w-full pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => router.push("/login")}
                  className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl"
                >
                  Sign In as Customer <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => router.push("/seller/login")}
                  className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl"
                >
                  Sign In to Seller Hub
                </Button>
              </div>
            </div>
          ) : (
            /* Password Reset Form */
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">
                  Create New Password
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary">
                  {sessionUser ? (
                    <>
                      Updating password for{" "}
                      <span className="font-semibold text-foreground">{sessionUser}</span>
                    </>
                  ) : (
                    "Enter and confirm your new password below."
                  )}
                </p>
              </div>

              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                {/* New Password Field */}
                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="block text-xs font-semibold text-foreground mb-1.5"
                  >
                    New Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                    <input
                      id="reset-new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                      className="w-full h-11 sm:h-12 pl-10 pr-11 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-0 bottom-0 px-3.5 flex items-center text-foreground-secondary hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password Field */}
                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-xs font-semibold text-foreground mb-1.5"
                  >
                    Confirm New Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                      className="w-full h-11 sm:h-12 pl-10 pr-11 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-0 bottom-0 px-3.5 flex items-center text-foreground-secondary hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Policy & Match Indicators */}
                <div className="p-3 bg-background-secondary/60 border border-border/80 rounded-xl flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    {isMinLength ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-foreground-secondary/60 shrink-0" />
                    )}
                    <span className={isMinLength ? "text-foreground font-medium" : "text-foreground-secondary"}>
                      At least 6 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {isMatching ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-foreground-secondary/60 shrink-0" />
                    )}
                    <span className={isMatching ? "text-foreground font-medium" : "text-foreground-secondary"}>
                      Passwords match
                    </span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  isLoading={isLoading}
                  loadingText="Updating password..."
                  disabled={!isFormValid || isLoading}
                  className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl mt-1"
                >
                  Update Password
                </Button>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-xs font-semibold text-foreground-secondary hover:text-foreground flex items-center justify-center gap-1.5 mt-2 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Cancel & Return to Sign In
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
