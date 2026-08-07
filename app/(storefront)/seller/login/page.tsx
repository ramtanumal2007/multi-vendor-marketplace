"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { OTPVerification } from "@/components/ui/OTPVerification";
import { useToast } from "@/components/ui/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function SellerLoginContent() {
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/seller";

  const routeSeller = async (userId: string, authData: any = null) => {
    // Check profile role and seller profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role === "admin") {
      addToast({ title: "Welcome Admin", description: "Redirecting to admin dashboard.", type: "success" });
      router.push("/admin");
      router.refresh();
      return;
    }

    const { data: sellerProfile } = await supabase
      .from("seller_profiles")
      .select("verification_status")
      .eq("id", userId)
      .single();

    if (!sellerProfile) {
      const isSellerReg = authData?.user?.user_metadata?.is_seller_registration;
      
      if (isSellerReg) {
         const meta = authData.user!.user_metadata;
         const { error: insertError } = await supabase.from("seller_profiles").insert({
           id: userId,
           business_name: meta.store_name || "New Store",
           contact_name: meta.full_name || "Contact",
           phone: meta.phone || "",
           business_email: email,
           business_type: "retail",
           verification_status: "pending"
         });
         
         if (!insertError) {
           addToast({ title: "Welcome!", description: "Your seller profile is created and pending approval.", type: "success" });
           router.push("/seller/onboarding");
           router.refresh();
           return;
         }
      }

      // Normal customer without seller account
      addToast({ title: "Apply as Seller", description: "Redirecting to Seller Application form.", type: "info" });
      router.push("/seller/onboarding");
      router.refresh();
      return;
    }

    if (profile?.role === "seller" && sellerProfile?.verification_status === "approved") {
      addToast({ title: "Welcome back!", type: "success" });
      router.push(redirect === "/seller/login" ? "/seller" : redirect);
      router.refresh();
    } else {
      addToast({ title: "Account Pending", description: `Your seller account is currently ${sellerProfile.verification_status || "pending review"}.`, type: "info" });
      router.push("/seller/onboarding");
      router.refresh();
    }
  };

  const handleVerified = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await routeSeller(user.id);
    } else {
      addToast({ title: "Error", description: "Failed to establish session after verification.", type: "error" });
      setShowOTPVerification(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (loginMethod === "password") {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      
      if (authError) {
        addToast({ title: "Error", description: authError.message, type: "error" });
        setIsLoading(false);
        return;
      }

      await routeSeller(authData.user!.id, authData);
    } else {
      // OTP Login Request
      const { error } = await supabase.auth.signInWithOtp({ 
        email, 
        options: { shouldCreateUser: false } 
      });
      if (error) {
        addToast({ title: "Error", description: error.message, type: "error" });
      } else {
        setShowOTPVerification(true);
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex min-h-[80vh] w-full mt-[60px] md:mt-[80px]">
      <div className="hidden lg:flex w-1/2 bg-accent/5 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-fashion/20 via-background to-accent/20 z-0" />
        <div className="relative z-10 text-center max-w-lg">
          <h2 className="text-4xl font-bold mb-6 text-foreground leading-tight">Seller Portal</h2>
          <p className="text-lg text-foreground-secondary leading-relaxed">
            Manage your store, products, and orders all in one place.
          </p>
        </div>
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
        <div className="absolute top-1/3 -right-20 w-72 h-72 bg-brand-fashion/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-32 left-1/2 w-80 h-80 bg-brand-grocery/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
      </div>
      
      <div className="flex-1 flex items-center justify-center py-20 px-6 lg:px-20 z-10 bg-background">
        <div className="w-full max-w-md">
          {showOTPVerification ? (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <OTPVerification 
                  email={email} 
                  type="email" 
                  onVerified={handleVerified}
                  title="Login Verification"
                  description="We've sent a login code to your email."
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              <div className="text-center mb-10">
                <h1 className="text-3xl font-bold mb-4">Sign In as Seller</h1>
                <p className="text-foreground-secondary">
                  Welcome back to your seller dashboard.
                </p>
              </div>

              <div className="flex mb-8 border-b border-border">
                <div className="flex-1 pb-4 text-center text-sm font-medium uppercase tracking-widest transition-colors border-b-2 border-accent text-foreground">
                  Sign In
                </div>
                <Link 
                  href="/seller/register"
                  className="flex-1 pb-4 text-center text-sm font-medium uppercase tracking-widest transition-colors border-b-2 border-transparent text-foreground-secondary hover:text-foreground"
                >
                  Register
                </Link>
              </div>

              <AnimatePresence mode="wait">
                <motion.form 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleLogin}
                  className="flex flex-col gap-6"
                >
                  <div className="flex justify-center gap-4 mb-2">
                    <button
                      type="button"
                      onClick={() => setLoginMethod("password")}
                      className={`text-sm font-medium px-4 py-2 rounded-full transition-colors ${loginMethod === "password" ? "bg-accent/10 text-accent" : "text-foreground-secondary hover:bg-accent/5"}`}
                    >
                      Use Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginMethod("otp")}
                      className={`text-sm font-medium px-4 py-2 rounded-full transition-colors ${loginMethod === "otp" ? "bg-accent/10 text-accent" : "text-foreground-secondary hover:bg-accent/5"}`}
                    >
                      Use Email OTP
                    </button>
                  </div>

                  <Input 
                    label="Email Address" 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                  
                  {loginMethod === "password" && (
                    <div>
                      <PasswordInput 
                        label="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required 
                      />
                      <div className="flex justify-end mt-2">
                        <button type="button" className="text-sm text-foreground-secondary hover:text-foreground underline">
                          Forgot password?
                        </button>
                      </div>
                    </div>
                  )}

                  <Button variant="primary" size="lg" type="submit" isLoading={isLoading} className="w-full mt-2 h-14">
                    {loginMethod === "password" ? "Sign In to Dashboard" : "Send OTP"}
                  </Button>
                </motion.form>
              </AnimatePresence>
            </>
          )}
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
