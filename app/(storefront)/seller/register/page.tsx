"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { OTPVerification } from "@/components/ui/OTPVerification";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

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
          .single();
          
        if (sellerProfile) {
          router.push("/seller/login");
        } else {
          router.push("/seller/onboarding");
        }
      }
    }
    checkAuth();
  }, [supabase.auth, router]);

  const handleVerified = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: profileError } = await supabase
        .from("seller_profiles")
        .insert({
          id: user.id,
          business_name: storeName,
          contact_name: fullName,
          phone: mobileNumber,
          business_email: email,
          business_type: "retail",
          verification_status: "pending"
        });

      if (profileError) {
        addToast({ title: "Warning", description: "Account created but profile setup failed: " + profileError.message, type: "error" });
      } else {
        addToast({ title: "Success", description: "Registration successful. Your account is pending approval.", type: "success" });
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
      addToast({ title: "Error", description: "Passwords do not match.", type: "error" });
      return;
    }
    setIsLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({ 
      email, 
      password,
      options: { 
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          store_name: storeName,
          store_description: storeDescription,
          business_address: businessAddress,
          phone: mobileNumber,
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
      addToast({ title: "Error", description: "An account with this email already exists. Please sign in instead.", type: "error" });
      setIsLoading(false);
      return;
    }

    if (authData.session) {
      // Very unlikely with email confirmation required, but handled as fallback
      await handleVerified();
    } else {
      setShowOTPVerification(true);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex min-h-[80vh] w-full mt-[60px] md:mt-[80px]">
      <div className="hidden lg:flex w-1/2 bg-accent/5 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-fashion/20 via-background to-accent/20 z-0" />
        <div className="relative z-10 text-center max-w-lg">
          <h2 className="text-4xl font-bold mb-6 text-foreground leading-tight">Partner With Us.</h2>
          <p className="text-lg text-foreground-secondary leading-relaxed">
            Reach thousands of local customers. Register your store today and start selling on our marketplace.
          </p>
        </div>
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
        <div className="absolute top-1/3 -right-20 w-72 h-72 bg-brand-fashion/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-32 left-1/2 w-80 h-80 bg-brand-grocery/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
      </div>
      
      <div className="flex-1 flex items-center justify-center py-12 px-6 lg:px-20 z-10 bg-background overflow-y-auto">
        <div className="w-full max-w-xl">
          {showOTPVerification ? (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <OTPVerification 
                  email={email} 
                  type="signup" 
                  onVerified={handleVerified}
                  title="Verify Your Email"
                  description="We've sent a 6-digit confirmation code to your email. Please enter it to complete your seller application."
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-4">Become a Seller</h1>
                <p className="text-foreground-secondary">
                  Fill out the form below to apply for a seller account.
                </p>
              </div>

              <div className="flex mb-6 border-b border-border">
                <Link 
                  href="/seller/login"
                  className="flex-1 pb-4 text-center text-sm font-medium uppercase tracking-widest transition-colors border-b-2 border-transparent text-foreground-secondary hover:text-foreground"
                >
                  Sign In
                </Link>
                <div className="flex-1 pb-4 text-center text-sm font-medium uppercase tracking-widest transition-colors border-b-2 border-accent text-foreground">
                  Register
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.form 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleRegister}
                  className="flex flex-col gap-5"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input 
                      label="Full Name" 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required 
                    />
                    <Input 
                      label="Email Address" 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input 
                      label="Mobile Number" 
                      type="tel" 
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      required 
                    />
                    <Input 
                      label="Store Name" 
                      type="text" 
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <PasswordInput 
                      label="Password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      minLength={6}
                    />
                    <PasswordInput 
                      label="Confirm Password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required 
                      minLength={6}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Store Description</label>
                    <textarea
                      className="w-full min-h-[80px] p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all resize-y"
                      value={storeDescription}
                      onChange={(e) => setStoreDescription(e.target.value)}
                      required
                      placeholder="Tell us about what you sell..."
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Business Address</label>
                    <textarea
                      className="w-full min-h-[80px] p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all resize-y"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      required
                      placeholder="Your full business address..."
                    />
                  </div>

                  <Button variant="primary" size="lg" type="submit" isLoading={isLoading} className="w-full mt-4 h-14">
                    Submit Application
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

export default function SellerRegisterPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20 px-6"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div></div>}>
      <SellerRegisterContent />
    </Suspense>
  );
}
