"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { OTPVerification } from "@/components/ui/OTPVerification";
import { useToast } from "@/components/ui/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Store } from "lucide-react";

interface SellerAuthData {
  user?: {
    user_metadata?: {
      is_seller_registration?: boolean;
      store_name?: string;
      full_name?: string;
      phone?: string;
    };
  } | null;
}

function SellerLoginContent() {
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isRecoveryOTP, setIsRecoveryOTP] = useState(false);
  const [accountNotFound, setAccountNotFound] = useState(false);
  const [incorrectCredentials, setIncorrectCredentials] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/seller";

  const routeSeller = async (userId: string, authData: SellerAuthData | null = null) => {
    try {
      // Check profile role and seller profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.role === "admin") {
        addToast({ title: "Welcome Admin", description: "Redirecting to admin dashboard.", type: "success" });
        router.push("/admin");
        return;
      }

      const { data: sellerProfile } = await supabase
        .from("seller_profiles")
        .select("verification_status")
        .eq("id", userId)
        .maybeSingle();

      if (!sellerProfile) {
        const isSellerReg = authData?.user?.user_metadata?.is_seller_registration;

        if (isSellerReg) {
            const meta = authData?.user?.user_metadata || {};
            const { error: insertError } = await supabase.from("seller_profiles").insert({
              id: userId,
              business_name: meta.store_name || "New Store",
              contact_name: meta.full_name || "Contact",
              phone: meta.phone || "",
              business_email: email.trim(),
              business_type: "retail",
              verification_status: "pending"
            });

           if (!insertError) {
             addToast({ title: "Welcome!", description: "Your seller profile is created and pending approval.", type: "success" });
             router.push("/seller/onboarding");
             return;
           }
        }

        // Normal customer without seller account
        addToast({ title: "Apply as Seller", description: "Redirecting to Seller Application form.", type: "info" });
        router.push("/seller/onboarding");
        return;
      }

      const isApproved = sellerProfile?.verification_status === "approved";

      if (isApproved) {
        addToast({ title: "Welcome back!", description: "Opening your Seller Hub.", type: "success" });
        const targetRedirect = redirect && redirect !== "/seller/login" && redirect !== "/seller/onboarding"
          ? redirect
          : "/seller";
        router.push(targetRedirect);
      } else {
        addToast({
          title: "Application Pending",
          description: `Your seller application is currently ${sellerProfile.verification_status || "under review"}.`,
          type: "info"
        });
        router.push("/seller/tracking");
      }
    } catch (err) {
      console.error("Seller routing error:", err);
      router.push("/seller");
    }
  };

  const handleVerified = async () => {
    setIsSigningIn(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await routeSeller(user.id);
    } else {
      setIsSigningIn(false);
      addToast({ title: "Error", description: "Failed to establish session after verification.", type: "error" });
      setShowOTPVerification(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isSigningIn) return; // Prevent duplicate login submissions

    setIsLoading(true);
    setAccountNotFound(false);
    setIncorrectCredentials(false);

    const cleanEmail = email.trim();

    if (loginMethod === "password") {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (authError) {
        setIsLoading(false);
        setIsSigningIn(false);
        try {
          const checkRes = await fetch("/api/auth/validate-login-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, targetPortal: "seller" }),
          });
          const checkData = await checkRes.json();
          if (!checkData.exists) {
            setAccountNotFound(true);
            setIncorrectCredentials(false);
            addToast({
              title: "Account Not Found",
              description: "No account found with this email. Please create an account first.",
              type: "error"
            });
          } else {
            setAccountNotFound(false);
            setIncorrectCredentials(true);
            addToast({
              title: "Authentication Failed",
              description: "Incorrect email or password. Please try again.",
              type: "error"
            });
          }
        } catch {
          setIncorrectCredentials(true);
          addToast({
            title: "Authentication Failed",
            description: "Incorrect email or password. Please try again.",
            type: "error"
          });
        }
        return;
      }

      setAccountNotFound(false);
      setIncorrectCredentials(false);
      setIsSigningIn(true);
      await routeSeller(authData.user!.id, authData);
    } else {
      // OTP Login Request
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false }
      });
      if (error) {
        try {
          const checkRes = await fetch("/api/auth/validate-login-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, targetPortal: "seller" }),
          });
          const checkData = await checkRes.json();
          if (!checkData.exists) {
            setAccountNotFound(true);
            addToast({
              title: "Account Not Found",
              description: "No account found with this email. Please create an account first.",
              type: "error"
            });
          } else {
            addToast({ title: "Error", description: error.message, type: "error" });
          }
        } catch {
          addToast({ title: "Error", description: error.message, type: "error" });
        }
      } else {
        setAccountNotFound(false);
        setIncorrectCredentials(false);
        setShowOTPVerification(true);
      }
    }

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      addToast({ title: "Validation Error", description: "Please enter your seller account email address.", type: "error" });
      return;
    }

    setIsLoading(true);
    setAccountNotFound(false);

    try {
      const checkRes = await fetch("/api/auth/validate-login-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, targetPortal: "seller" }),
      });
      const checkData = await checkRes.json();
      if (!checkData.exists) {
        setAccountNotFound(true);
        addToast({
          title: "Account Not Found",
          description: "No account found with this email. Please create an account first.",
          type: "error"
        });
        setIsLoading(false);
        return;
      }
    } catch {
      // Proceed
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

    if (error) {
      addToast({ title: "Password Reset Request Failed", description: error.message, type: "error" });
    } else {
      setIsRecoveryOTP(true);
      addToast({
        title: "Recovery Code Dispatched",
        description: "A 6-digit recovery code has been sent to your seller email.",
        type: "success"
      });
    }
    setIsLoading(false);
  };

  // Immediate full-page signing-in state while role authorization & navigation completes
  if (isSigningIn) {
    return (
      <div className="flex-1 flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6 w-full">
        <div className="w-full max-w-[420px] mx-auto text-center">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
              <span className="text-2xl sm:text-3xl font-black tracking-wider text-foreground font-sans">
                VENDO<span className="text-accent">SMITH</span>
              </span>
            </Link>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mt-2.5">
              <Store className="w-3.5 h-3.5" />
              <span>Seller Hub</span>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground mb-1.5">
                Signing you in to Seller Hub...
              </h2>
              <p className="text-xs sm:text-sm text-foreground-secondary leading-relaxed">
                Verifying your seller credentials and opening your dashboard...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6 w-full">
      <div className="w-full max-w-[460px] mx-auto">

        {/* Seller Portal Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
            <span className="text-2xl sm:text-3xl font-black tracking-wider text-foreground font-sans">
              VENDO<span className="text-accent">SMITH</span>
            </span>
          </Link>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mt-2.5">
            <Store className="w-3.5 h-3.5" />
            <span>Seller Hub</span>
          </div>
        </div>

        {/* Auth Card Container */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm sm:shadow-md transition-all">
          {isForgotPassword ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="forgot-password"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                {isRecoveryOTP ? (
                  <OTPVerification
                    email={email.trim()}
                    type="recovery"
                    onVerified={() => {
                      addToast({
                        title: "Code Verified 🎉",
                        description: "Please enter your new password.",
                        type: "success"
                      });
                      router.push("/reset-password");
                    }}
                    onBack={() => {
                      setIsRecoveryOTP(false);
                    }}
                    title="Reset Seller Password"
                    description="We've sent a 6-digit recovery code to your seller email. Enter it below to proceed."
                  />
                ) : (
                  <>
                    <div className="text-center">
                      <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">Reset Password</h1>
                      <p className="text-xs sm:text-sm text-foreground-secondary">
                        Enter your registered seller email address to receive password reset instructions.
                      </p>
                    </div>

                    {accountNotFound && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-foreground font-medium">
                            No account found with this email. Please create an account first.
                          </p>
                        </div>
                        <Link href="/seller/register" className="self-start">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs font-semibold h-8 rounded-lg border-accent/30 text-accent hover:bg-accent/10"
                          >
                            Create Seller Account
                          </Button>
                        </Link>
                      </div>
                    )}

                    <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                      <div>
                        <label htmlFor="reset-seller-email" className="block text-xs font-semibold text-foreground mb-1.5">
                          Seller Email Address <span className="text-destructive">*</span>
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                          <input
                            id="reset-seller-email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (accountNotFound) setAccountNotFound(false);
                            }}
                            placeholder="seller@example.com"
                            required
                            className="w-full h-11 sm:h-12 pl-10 pr-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                          />
                        </div>
                      </div>

                      <Button variant="primary" size="lg" type="submit" isLoading={isLoading} className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl mt-1">
                        Send Recovery Code
                      </Button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(false);
                          setAccountNotFound(false);
                        }}
                        className="text-xs font-semibold text-foreground-secondary hover:text-foreground flex items-center justify-center gap-1.5 mt-2 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Seller Sign In
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          ) : showOTPVerification ? (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <OTPVerification
                  email={email.trim()}
                  type="email"
                  onVerified={handleVerified}
                  onBack={() => setShowOTPVerification(false)}
                  title="Seller Verification"
                  description="We've sent a login verification code to your seller email."
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              {/* Heading */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
                  Seller Login
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary">
                  Sign in to manage your VENDOSMITH store.
                </p>
              </div>

              {/* Segmented Switch: Sign In vs Register */}
              <div className="grid grid-cols-2 p-1 bg-background-secondary rounded-xl mb-6 border border-border">
                <div className="py-2 text-center text-xs sm:text-sm font-semibold rounded-lg bg-card text-foreground shadow-sm">
                  Sign In
                </div>
                <Link
                  href="/seller/register"
                  className="py-2 text-center text-xs sm:text-sm font-semibold rounded-lg text-foreground-secondary hover:text-foreground transition-all"
                >
                  Register
                </Link>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                {/* Account Not Found Banner */}
                {accountNotFound && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground font-medium">
                        No account found with this email. Please create an account first.
                      </p>
                    </div>
                    <Link href="/seller/register" className="self-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs font-semibold h-8 rounded-lg border-accent/30 text-accent hover:bg-accent/10"
                      >
                        Create Seller Account
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Incorrect Credentials Banner */}
                {incorrectCredentials && !accountNotFound && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Incorrect email or password. Please try again.</span>
                  </div>
                )}
                {/* Method Toggle: Password vs OTP */}
                <div className="flex justify-center gap-2 mb-1 p-1 bg-background-secondary/60 rounded-lg border border-border/50">
                  <button
                    type="button"
                    onClick={() => setLoginMethod("password")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      loginMethod === "password"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod("otp")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      loginMethod === "otp"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    Email OTP
                  </button>
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor="seller-email" className="block text-xs font-semibold text-foreground mb-1.5">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                    <input
                      id="seller-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seller@example.com"
                      required
                      autoComplete="email"
                      className="w-full h-11 sm:h-12 pl-10 pr-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                    />
                  </div>
                </div>

                {/* Password Field (for Password Login) */}
                {loginMethod === "password" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="seller-password" className="block text-xs font-semibold text-foreground">
                        Password <span className="text-destructive">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(true)}
                        className="text-xs text-foreground-secondary hover:text-accent font-medium transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                      <input
                        id="seller-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your seller password"
                        required
                        autoComplete="current-password"
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
                )}

                {/* Primary Submit Button */}
                <Button
                  variant="primary"
                  size="lg"
                  type="submit"
                  isLoading={isLoading}
                  disabled={isLoading}
                  className="w-full mt-2 h-11 sm:h-12 font-semibold text-sm rounded-xl shadow-sm"
                >
                  {loginMethod === "password" ? "Sign In" : "Send Login Code"}
                </Button>
              </form>

              {/* Secondary Navigation */}
              <div className="flex flex-col gap-2 text-center pt-4 text-xs text-foreground-secondary border-t border-border mt-5">
                <p>
                  New seller on VENDOSMITH?{" "}
                  <Link href="/seller/register" className="font-semibold text-accent hover:text-accent-hover transition-colors underline underline-offset-2">
                    Apply to become a seller
                  </Link>
                </p>
                <p>
                  Looking for customer account?{" "}
                  <Link href="/login" className="font-semibold text-foreground hover:text-accent transition-colors underline underline-offset-2">
                    Customer Sign In
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Back to Storefront Link */}
        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground font-medium transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to VENDOSMITH Storefront
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function SellerLoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20 px-6"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div></div>}>
      <SellerLoginContent />
    </Suspense>
  );
}
