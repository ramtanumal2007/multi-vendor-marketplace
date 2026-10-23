"use client";

import React, { useEffect, useState, useCallback } from "react";
import { User, ShieldCheck, KeyRound, Check, AlertCircle, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface CustomerProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  customer_id_code?: string | null;
  role: string;
  created_at?: string;
}

export default function AccountSettingsPage() {
  const { user, refreshAuth } = useAuth();
  const { addToast } = useToast();
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Profile Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
      }
    } catch (err: unknown) {
      console.error("Error fetching profile:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSavingProfile(true);
    setProfileMessage(null);

    try {
      const updatedName = fullName.trim();
      const updatedPhone = phone.trim() || null;

      // Update public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: updatedName,
          phone: updatedPhone,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Update Supabase auth user metadata
      await supabase.auth.updateUser({
        data: { full_name: updatedName },
      });

      await refreshAuth();
      setProfileMessage({ type: "success", text: "Profile details updated successfully." });
      addToast({ title: "Profile Saved", description: "Your personal details have been updated.", type: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile details.";
      setProfileMessage({ type: "error", text: message });
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "success", text: "Password changed successfully." });
      addToast({ title: "Security Updated", description: "Your account password has been updated.", type: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to change password.";
      setPasswordMessage({ type: "error", text: message });
      addToast({ title: "Error", description: message, type: "error" });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    addToast({ title: "Logged out successfully", type: "success" });
    router.push("/login");
  };

  const memberSince = profile?.created_at
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(profile.created_at))
    : null;

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl">
      <div className="pb-4 border-b border-border">
        <h2 className="text-2xl font-serif font-bold text-foreground">Account Settings</h2>
        <p className="text-sm text-foreground-secondary mt-1">
          Manage your personal profile, contact information, and account security.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-64 rounded-2xl bg-background-secondary/60 animate-pulse border border-border" />
          <div className="h-64 rounded-2xl bg-background-secondary/60 animate-pulse border border-border" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* SECTION 1: Personal Details */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs">
            <div className="flex items-center gap-3 pb-4 mb-6 border-b border-border/70">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Personal Information</h3>
                <p className="text-xs text-foreground-secondary">Your public identifier and notification contact</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    profileMessage.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {profileMessage.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{profileMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={user?.email || ""}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background-secondary/50 text-foreground-secondary text-sm cursor-not-allowed pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600" title="Verified Account Email">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                  </div>
                  <span className="text-[11px] text-foreground-secondary/70">Email cannot be changed directly for security purposes.</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your legal name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Primary Mobile Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>

                {profile?.customer_id_code && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">Marketplace Customer ID</label>
                    <input
                      type="text"
                      disabled
                      value={profile.customer_id_code}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background-secondary/50 text-foreground-secondary text-sm font-mono cursor-not-allowed"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="primary" type="submit" disabled={isSavingProfile} className="font-semibold shadow-xs">
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving Changes...
                    </>
                  ) : (
                    "Save Personal Details"
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* SECTION 2: Security & Password */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs">
            <div className="flex items-center gap-3 pb-4 mb-6 border-b border-border/70">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Security & Password</h3>
                <p className="text-xs text-foreground-secondary">Update your password to protect your orders and account</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {passwordMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    passwordMessage.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {passwordMessage.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="outline" type="submit" disabled={isUpdatingPassword} className="font-semibold">
                  {isUpdatingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Updating Password...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* SECTION 3: Account Meta & Sign Out */}
          <div className="bg-background-secondary/30 rounded-2xl border border-border/80 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">Session & Privacy</p>
              <p className="text-xs text-foreground-secondary mt-0.5">
                {memberSince ? `Member of VENDOSMITH since ${memberSince}` : "Active Verified Customer"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-colors border border-destructive/20 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out of All Devices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
