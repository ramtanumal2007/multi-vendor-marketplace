"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface OTPVerificationProps {
  email: string;
  type: "signup" | "email";
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function OTPVerification({ email, type, onVerified, title = "Enter Verification Code", description = "We've sent a 6-digit code to your email." }: OTPVerificationProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const { addToast } = useToast();
  const supabase = createClient();
  const router = useRouter();

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
      addToast({ title: "Invalid Code", description: "Please enter a 6-digit code.", type: "error" });
      return;
    }
    setIsLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type
    });

    if (error) {
      addToast({ title: "Verification Failed", description: error.message, type: "error" });
      setIsLoading(false);
    } else {
      addToast({ title: "Verified Successfully", type: "success" });
      onVerified();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    
    setIsLoading(true);
    let resendError;

    if (type === "email") {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      resendError = error;
    } else {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      resendError = error;
    }

    if (resendError) {
      if (resendError.message.includes("rate limit")) {
        addToast({ title: "Too Many Requests", description: "Please wait before requesting another code.", type: "error" });
      } else {
        addToast({ title: "Failed to resend", description: resendError.message, type: "error" });
      }
    } else {
      addToast({ title: "Code Resent", description: "Please check your email.", type: "success" });
      setResendCooldown(60);
    }
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col gap-6 text-center w-full max-w-sm mx-auto">
      <div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-foreground-secondary">{description}</p>
        <p className="font-medium mt-1">{email}</p>
      </div>

      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
          className="h-16 text-center text-3xl font-mono tracking-[0.5em] rounded-md border border-border bg-transparent outline-none focus:border-accent transition-colors"
          placeholder="000000"
          autoComplete="one-time-code"
          autoFocus
        />
        
        <Button type="submit" disabled={isLoading || code.length !== 6} className="w-full h-12 text-base mt-2">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin h-5 w-5" /> Verifying...
            </span>
          ) : "Verify"}
        </Button>
      </form>

      <div className="text-sm mt-4">
        <p className="text-foreground-secondary mb-2">Didn't receive the code?</p>
        <button 
          onClick={handleResend}
          disabled={resendCooldown > 0 || isLoading}
          className="font-medium transition-colors hover:text-accent disabled:text-foreground-secondary/50 disabled:cursor-not-allowed"
        >
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
        </button>
      </div>
    </div>
  );
}
