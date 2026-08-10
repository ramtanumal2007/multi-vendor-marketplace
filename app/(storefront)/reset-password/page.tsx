"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { Lock, CheckCircle2, ArrowRight } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (data.user) {
        setSessionUser(data.user.email || null);
      }
    });
  }, [supabase]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      addToast({ title: "Reset Failed", description: error.message, type: "error" });
      setIsLoading(false);
    } else {
      setIsSuccess(true);
      addToast({ title: "Password Updated 🎉", description: "Your password has been successfully updated.", type: "success" });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-20 px-6 mt-[60px] md:mt-[80px] bg-background">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Create New Password</h1>
          <p className="text-sm text-foreground-secondary">
            {sessionUser ? (
              <>Updating password for <strong className="font-semibold text-foreground">{sessionUser}</strong></>
            ) : (
              "Set a strong new password for your customer account."
            )}
          </p>
        </div>

        {isSuccess ? (
          <div className="space-y-6 text-center">
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <p className="text-sm font-semibold">Your password has been changed successfully!</p>
              <p className="text-xs text-emerald-700">You can now sign in using your new password.</p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => router.push("/login")}
              className="w-full h-12"
            >
              Sign In to Your Account <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
            <PasswordInput
              label="New Password *"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <PasswordInput
              label="Confirm New Password *"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <Button
              variant="primary"
              size="lg"
              type="submit"
              isLoading={isLoading}
              className="w-full h-12 mt-2"
            >
              Update Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
