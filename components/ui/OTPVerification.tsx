"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { Loader2, Mail, ArrowLeft, ShieldCheck } from "lucide-react";

interface OTPVerificationProps {
  email: string;
  type: "signup" | "email";
  onVerified: () => void;
  onBack?: () => void;
  title?: string;
  description?: string;
}

function maskEmail(val: string): string {
  if (!val || !val.includes("@")) return val || "";
  const [local, domain] = val.split("@");
  if (!local || !domain) return val;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  const visibleStart = local.slice(0, 2);
  const visibleEnd = local.slice(-1);
  return `${visibleStart}****${visibleEnd}@${domain}`;
}

export function OTPVerification({
  email,
  type,
  onVerified,
  onBack,
  title = "Verify your email",
  description = "We've sent a 6-digit verification code to your email."
}: OTPVerificationProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      addToast({
        title: "Invalid Code",
        description: "Please enter the complete 6-digit verification code.",
        type: "error"
      });
      return;
    }
    setIsLoading(true);

    const cleanEmail = email.trim();
    const cleanToken = code.trim();

    // Verify 6-digit numeric OTP primarily with type: 'email'
    // Do NOT use the component's signup type directly for the primary numeric OTP verification
    let { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "email",
    });

    // Fallback: If type was signup and email verification failed, try signup fallback
    if (error && type === "signup") {
      const fallback = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: "signup",
      });
      if (!fallback.error) {
        error = null;
      }
    }

    if (error) {
      setCode("");
      addToast({
        title: "Verification Failed",
        description: error.message || "Invalid or expired code. Please enter the latest code or request a new one.",
        type: "error"
      });
      setIsLoading(false);
    } else {
      addToast({ title: "Verified Successfully", type: "success" });
      onVerified();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isLoading) return;

    setIsLoading(true);
    let resendError;

    const cleanEmail = email.trim();

    if (type === "email") {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false }
      });
      resendError = error;
    } else {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail
      });
      resendError = error;
    }

    if (resendError) {
      if (resendError.message.includes("rate limit") || resendError.message.toLowerCase().includes("too many")) {
        addToast({
          title: "Too Many Requests",
          description: "Please wait before requesting another verification code.",
          type: "error"
        });
      } else {
        addToast({
          title: "Failed to Resend",
          description: resendError.message,
          type: "error"
        });
      }
    } else {
      addToast({
        title: "Code Resent",
        description: "A fresh verification code has been dispatched to your email.",
        type: "success"
      });
      setResendCooldown(60);
    }
    setIsLoading(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (pasted) {
      setCode(pasted);
    }
  };

  return (
    <div className="flex flex-col gap-6 text-center w-full max-w-sm mx-auto">
      {/* Icon Badge & Header */}
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center mb-3 shadow-sm">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-xs sm:text-sm text-foreground-secondary mt-1.5 max-w-xs">{description}</p>

        {/* Masked Email Badge */}
        <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-background-secondary border border-border text-xs font-medium text-foreground">
          <Mail className="w-3.5 h-3.5 text-foreground-secondary" />
          <span>{maskEmail(email.trim())}</span>
        </div>
      </div>

      {/* OTP Form */}
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <div>
          <label htmlFor="otp-input" className="sr-only">6-digit verification code</label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            onPaste={handlePaste}
            className="w-full h-14 sm:h-16 text-center text-2xl sm:text-3xl font-mono font-bold tracking-[0.4em] sm:tracking-[0.6em] rounded-xl border border-border bg-background focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/30 shadow-inner"
            placeholder="••••••"
            autoComplete="one-time-code"
            autoFocus
            disabled={isLoading}
            aria-label="6-digit verification code"
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading || code.length !== 6}
          className="w-full h-12 text-sm sm:text-base font-semibold rounded-xl shadow-sm"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin h-5 w-5" /> Verifying...
            </span>
          ) : "Verify Email"}
        </Button>
      </form>

      {/* Resend & Back Actions */}
      <div className="flex flex-col items-center gap-3 pt-1 text-xs sm:text-sm">
        <div className="flex items-center gap-1 text-foreground-secondary">
          <span>Didn&apos;t receive the code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isLoading}
            className="font-semibold text-accent hover:text-accent-hover transition-colors disabled:text-foreground-secondary/50 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
          </button>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground underline underline-offset-4 transition-colors font-medium mt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Change email address
          </button>
        )}
      </div>
    </div>
  );
}
