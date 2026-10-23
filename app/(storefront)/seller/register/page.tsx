"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { OTPVerification } from "@/components/ui/OTPVerification";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Store, User, Phone, Mail, Building, ShieldCheck, MapPin } from "lucide-react";

function SellerRegisterContent() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOTPVerification, setShowOTPVerification] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: sellerProfile } = await supabase
          .from("seller_profiles")
          .select("verification_status")
          .eq("id", session.user.id)
          .maybeSingle();

        if (sellerProfile) {
          router.push("/seller/login");
        } else {
          router.push("/seller/onboarding");
        }
      }
    }
    checkAuth();
  }, [supabase, router]);

  const handleVerified = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const cleanDigits = mobileNumber.replace(/\D/g, "");
      const formattedPhone = `+91 ${cleanDigits}`;

      const { error: profileError } = await supabase
        .from("seller_profiles")
        .insert({
          id: user.id,
          business_name: storeName.trim(),
          contact_name: fullName.trim(),
          phone: formattedPhone,
          business_email: email.trim(),
          business_type: "retail",
          verification_status: "pending"
        });

      if (profileError) {
        addToast({ title: "Warning", description: "Account created but seller profile setup failed: " + profileError.message, type: "error" });
      } else {
        addToast({ title: "Application Submitted", description: "Registration successful. Your account is pending review.", type: "success" });
        router.push("/seller/tracking?submitted=true");
      }
    } else {
      addToast({ title: "Error", description: "Failed to establish session after verification.", type: "error" });
      setShowOTPVerification(false);
    }
    setIsLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      addToast({ title: "Validation Error", description: "Passwords do not match.", type: "error" });
      return;
    }

    const cleanDigits = mobileNumber.replace(/\D/g, "");
    if (cleanDigits.length !== 10) {
      addToast({ title: "Validation Error", description: "Please enter a valid 10-digit mobile number.", type: "error" });
      return;
    }

    setIsLoading(true);
    const formattedPhone = `+91 ${cleanDigits}`;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName.trim(),
          store_name: storeName.trim(),
          store_description: storeDescription.trim(),
          business_address: businessAddress.trim(),
          phone: formattedPhone,
          is_seller_registration: true
        }
      }
    });

    if (authError) {
      addToast({ title: "Error", description: authError.message, type: "error" });
      setIsLoading(false);
      return;
    }

    if (authData?.user?.identities && authData.user.identities.length === 0) {
      addToast({ title: "Account Exists", description: "An account with this email already exists. Please sign in instead.", type: "error" });
      setIsLoading(false);
      return;
    }

    if (authData.session) {
      await handleVerified();
    } else {
      setShowOTPVerification(true);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex min-h-[85vh] w-full">
      {/* Left decorative brand panel on large screens */}
      <div className="hidden lg:flex w-5/12 bg-accent/5 flex-col items-center justify-center p-12 relative overflow-hidden border-r border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-fashion/15 via-background to-accent/15 z-0" />
        <div className="relative z-10 text-center max-w-md">
          <div className="inline-flex p-3 bg-accent/10 text-accent rounded-2xl mb-6 shadow-sm">
            <Store className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-extrabold mb-4 text-foreground leading-tight">
            Partner With VENDOSMITH
          </h2>
          <p className="text-sm text-foreground-secondary leading-relaxed mb-6">
            Showcase your store to thousands of verified buyers. Fast onboarding, local reach, and transparent payouts.
          </p>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="p-3 bg-background/80 backdrop-blur-sm rounded-xl border border-border">
              <span className="text-xs font-bold text-foreground block">Verified Store</span>
              <span className="text-[11px] text-foreground-secondary">Official merchant badge</span>
            </div>
            <div className="p-3 bg-background/80 backdrop-blur-sm rounded-xl border border-border">
              <span className="text-xs font-bold text-foreground block">Direct Orders</span>
              <span className="text-[11px] text-foreground-secondary">Real-time management</span>
            </div>
          </div>
        </div>
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-accent/15 rounded-full mix-blend-multiply filter blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-32 right-0 w-80 h-80 bg-brand-grocery/15 rounded-full mix-blend-multiply filter blur-3xl opacity-60 pointer-events-none" />
      </div>

      {/* Main form section */}
      <div className="flex-1 flex items-center justify-center py-10 px-4 sm:px-8 lg:px-12 z-10 bg-background overflow-y-auto">
        <div className="w-full max-w-xl">
          {showOTPVerification ? (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-md"
              >
                <OTPVerification
                  email={email}
                  type="signup"
                  onVerified={handleVerified}
                  onBack={() => setShowOTPVerification(false)}
                  title="Verify Your Email"
                  description="We've sent a 6-digit confirmation code to your email. Enter it below to complete your seller application."
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
              {/* Form Heading & Subtitle */}
              <div className="text-center mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Become a Seller
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary mt-1.5">
                  Submit your merchant application to start selling on VENDOSMITH.
                </p>
              </div>

              {/* Navigation Tabs (Sign In / Register) */}
              <div className="flex mb-6 border-b border-border">
                <Link
                  href="/seller/login"
                  className="flex-1 pb-3 text-center text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 border-transparent text-foreground-secondary hover:text-foreground"
                >
                  Sign In
                </Link>
                <div className="flex-1 pb-3 text-center text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 border-accent text-foreground">
                  Register
                </div>
              </div>

              <form onSubmit={handleRegister} className="flex flex-col gap-6">
                {/* SECTION 1: Personal & Contact Information */}
                <div>
                  <div className="flex items-center gap-1.5 pb-2 border-b border-border/60 mb-3">
                    <User className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                      1. Contact Information
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="seller-fullname" className="block text-xs font-semibold text-foreground mb-1">
                        Full Name <span className="text-red-500 font-bold">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          id="seller-fullname"
                          type="text"
                          required
                          autoComplete="name"
                          placeholder="e.g. Ramesh Chandra"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-foreground-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="seller-email" className="block text-xs font-semibold text-foreground mb-1">
                        Email Address <span className="text-red-500 font-bold">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          id="seller-email"
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="merchant@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-foreground-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mobile Number Field (+91 Fixed Prefix) */}
                  <div className="mt-3.5">
                    <label htmlFor="seller-phone" className="block text-xs font-semibold text-foreground mb-1">
                      Mobile Number <span className="text-red-500 font-bold">*</span>
                    </label>
                    <div className="relative flex items-center rounded-xl border border-border bg-background focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all overflow-hidden">
                      <span className="flex items-center gap-1 px-3 h-11 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs sm:text-sm border-r border-border select-none shrink-0">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        +91
                      </span>
                      <input
                        id="seller-phone"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        autoComplete="tel-national"
                        required
                        placeholder="10-digit mobile number"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="w-full h-11 px-3 bg-transparent text-sm text-foreground placeholder:text-foreground-secondary/40 outline-none font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-foreground-secondary mt-1">
                      10-digit Indian phone number for operational notifications.
                    </p>
                  </div>
                </div>

                {/* SECTION 2: Store & Business Details */}
                <div>
                  <div className="flex items-center gap-1.5 pb-2 border-b border-border/60 mb-3">
                    <Building className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                      2. Business &amp; Store Details
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <label htmlFor="seller-storename" className="block text-xs font-semibold text-foreground mb-1">
                        Store Name <span className="text-red-500 font-bold">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <Store className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          id="seller-storename"
                          type="text"
                          required
                          placeholder="e.g. Tarama Bhandar"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-foreground-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="seller-storedesc" className="block text-xs font-semibold text-foreground mb-1">
                        Store Description <span className="text-red-500 font-bold">*</span>
                      </label>
                      <textarea
                        id="seller-storedesc"
                        required
                        rows={2}
                        placeholder="Briefly describe what products your store offers..."
                        value={storeDescription}
                        onChange={(e) => setStoreDescription(e.target.value)}
                        className="w-full p-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-foreground-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all resize-y min-h-[70px]"
                      />
                    </div>

                    <div>
                      <label htmlFor="seller-address" className="block text-xs font-semibold text-foreground mb-1">
                        Business Address <span className="text-red-500 font-bold">*</span>
                      </label>
                      <div className="relative flex">
                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        <textarea
                          id="seller-address"
                          required
                          rows={2}
                          placeholder="Full store/warehouse address, City, State, PIN..."
                          value={businessAddress}
                          onChange={(e) => setBusinessAddress(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-foreground-secondary/40 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all resize-y min-h-[70px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Account Security */}
                <div>
                  <div className="flex items-center gap-1.5 pb-2 border-b border-border/60 mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                      3. Account Password
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="seller-password" className="block text-xs font-semibold text-foreground mb-1">
                        Password <span className="text-red-500 font-bold">*</span>
                      </label>
                      <PasswordInput
                        id="seller-password"
                        label=""
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Min. 6 characters"
                        className="h-11"
                      />
                    </div>

                    <div>
                      <label htmlFor="seller-confirmpassword" className="block text-xs font-semibold text-foreground mb-1">
                        Confirm Password <span className="text-red-500 font-bold">*</span>
                      </label>
                      <PasswordInput
                        id="seller-confirmpassword"
                        label=""
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Re-enter password"
                        className="h-11"
                      />
                    </div>
                  </div>
                </div>

                {/* Submission CTA */}
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    type="submit"
                    isLoading={isLoading}
                    className="w-full h-12 text-sm font-bold shadow-md hover:shadow-lg transition-all rounded-xl"
                  >
                    Submit Application
                  </Button>
                  <p className="text-[11px] text-foreground-secondary text-center mt-2.5">
                    By submitting, you agree to VENDOSMITH&apos;s Merchant Terms and Seller Policies.
                  </p>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SellerRegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center py-20 px-6">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SellerRegisterContent />
    </Suspense>
  );
}
