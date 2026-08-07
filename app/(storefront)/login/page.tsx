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

function LoginContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = rawRedirect.startsWith("/") ? rawRedirect : `/${rawRedirect}`;

  const routeUser = async (userId: string) => {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
    const { data: sellerProfile } = await supabase.from("seller_profiles").select("verification_status").eq("id", userId).single();

    if (redirect === "/admin") {
      if (profile?.role === "admin") {
        addToast({ title: "Welcome Admin!", type: "success" });
        router.push("/admin");
        router.refresh();
      } else {
        addToast({ title: "Access Denied", description: "You do not have admin privileges.", type: "error" });
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      }
      return;
    }

    addToast({ title: "Welcome!", type: "success" });

    if (profile?.role === "admin") {
      router.push("/admin");
      router.refresh();
      return;
    }

    if (profile?.role === "seller" && sellerProfile?.verification_status === "approved") {
      router.push("/seller");
      router.refresh();
      return;
    }

    if (sellerProfile) {
      router.push("/seller/onboarding");
      router.refresh();
      return;
    }

    router.push(redirect === "/admin" ? "/" : redirect);
    router.refresh();
  };

  const handleVerified = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await routeUser(user.id);
    } else {
      addToast({ title: "Error", description: "Failed to establish session after verification.", type: "error" });
      setShowOTPVerification(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (isLogin) {
      if (loginMethod === "password") {
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          addToast({ title: "Error", description: error.message, type: "error" });
        } else {
          await routeUser(authData.user!.id);
        }
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
    } else {
      // Register
      const { error } = await supabase.auth.signUp({ 
        email, 
        password
      });
      
      if (error) {
        addToast({ title: "Error", description: error.message, type: "error" });
      } else {
        setShowOTPVerification(true);
      }
    }
    
    setIsLoading(false);
  };

  const handleGoogleOAuth = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  };

  return (
    <div className="flex-1 flex min-h-[80vh] w-full mt-[60px] md:mt-[80px]">
      <div className="hidden lg:flex w-1/2 bg-accent/5 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-fashion/20 via-background to-accent/20 z-0" />
        <div className="relative z-10 text-center max-w-lg">
          <h2 className="text-4xl font-bold mb-6 text-foreground leading-tight">Your Local Marketplace, Simplified.</h2>
          <p className="text-lg text-foreground-secondary leading-relaxed">
            Join thousands of users shopping from the best local stores with guaranteed fast delivery.
          </p>
        </div>
        {/* Abstract shapes */}
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
                type={isLogin ? "email" : "signup"} 
                onVerified={handleVerified}
                title={isLogin ? "Login Verification" : "Verify Your Email"}
                description={isLogin ? "We've sent a login code to your email." : "We've sent a 6-digit confirmation code to your email."}
              />
            </motion.div>
          </AnimatePresence>
        ) : (
        <>
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-4">{isLogin ? "Sign In to Your Account" : "Create an Account"}</h1>
            <p className="text-foreground-secondary">
              {isLogin 
                ? "Welcome back. Enter your details to access your account." 
                : "Join us for an exclusive shopping experience."}
            </p>
          </div>

          <div className="flex mb-8 border-b border-border">
            <button 
              className={`flex-1 pb-4 text-sm font-medium uppercase tracking-widest transition-colors border-b-2 ${isLogin ? "border-accent text-foreground" : "border-transparent text-foreground-secondary hover:text-foreground"}`}
              onClick={() => { setIsLogin(true); setLoginMethod("password"); }}
            >
              Sign In
            </button>
            <button 
              className={`flex-1 pb-4 text-sm font-medium uppercase tracking-widest transition-colors border-b-2 ${!isLogin ? "border-accent text-foreground" : "border-transparent text-foreground-secondary hover:text-foreground"}`}
              onClick={() => setIsLogin(false)}
            >
              Register
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.form 
              key={isLogin ? "login" : "register"}
              initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleAuth}
              className="flex flex-col gap-6"
            >
              {isLogin && (
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
              )}

              <Input 
                label="Email Address" 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              
              {(!isLogin || loginMethod === "password") && (
                <div>
                  <PasswordInput 
                    label="Password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                  />
                  {isLogin && (
                    <div className="flex justify-end mt-2">
                      <button type="button" className="text-sm text-foreground-secondary hover:text-foreground underline">
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              <Button variant="primary" size="lg" type="submit" isLoading={isLoading} className="w-full mt-2 h-14">
                {isLogin ? (loginMethod === "password" ? "Sign In" : "Send OTP") : "Create Account"}
              </Button>
              
              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink-0 mx-4 text-foreground-secondary text-sm">or continue with</span>
                <div className="flex-grow border-t border-border"></div>
              </div>
              
              <Button variant="outline" type="button" size="lg" className="w-full h-14 flex items-center justify-center gap-2" onClick={handleGoogleOAuth}>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20 px-6"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div></div>}>
      <LoginContent />
    </Suspense>
  );
}
