"use client";

import React, { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { OTPVerification } from "@/components/ui/OTPVerification";
import { useToast } from "@/components/ui/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from "lucide-react";

function LoginContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [showOTPVerification, setShowOTPVerification] = useState(false);

  // Registration & Login Fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const supabase = createClient();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = rawRedirect.startsWith("/") ? rawRedirect : `/${rawRedirect}`;

  const routeUser = async (userId: string) => {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();

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

    addToast({ title: "Welcome back!", type: "success" });

    if (profile?.role === "admin") {
      router.push("/admin");
      router.refresh();
      return;
    }

    // Always open normal customer storefront/account after customer login
    // Never auto-redirect sellers to /seller or /seller/onboarding from customer login
    const targetRedirect = redirect === "/admin" || redirect === "/seller" || redirect.startsWith("/seller/")
      ? "/"
      : redirect;

    router.push(targetRedirect);
    router.refresh();
  };

  const handleVerified = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Ensure customer profile is updated idempotently with full_name & phone
      if (fullName || phone) {
        await supabase.from("profiles").upsert({
          id: user.id,
          email: user.email || email.trim(),
          full_name: fullName.trim() || user.user_metadata?.full_name,
          phone: phone.trim() || user.user_metadata?.phone,
          role: "customer",
          updated_at: new Date().toISOString()
        }, { onConflict: "id" });
      }

      await routeUser(user.id);
    } else {
      addToast({ title: "Error", description: "Failed to establish session after verification.", type: "error" });
      setShowOTPVerification(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (isLogin) {
      if (loginMethod === "password") {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        });
        if (error) {
          addToast({ title: "Authentication Failed", description: error.message, type: "error" });
        } else if (authData?.user) {
          await routeUser(authData.user.id);
        }
      } else {
        // OTP Login Request
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: { shouldCreateUser: false }
        });
        if (error) {
          addToast({ title: "Error", description: error.message, type: "error" });
        } else {
          setShowOTPVerification(true);
        }
      }
    } else {
      // Register New Customer Account
      const cleanName = fullName.trim();
      const cleanPhone = phone.trim();

      if (!cleanName) {
        addToast({ title: "Validation Error", description: "Full Name is required.", type: "error" });
        setIsLoading(false);
        return;
      }

      if (!cleanPhone) {
        addToast({ title: "Validation Error", description: "Mobile Number is required.", type: "error" });
        setIsLoading(false);
        return;
      }

      if (cleanPassword.length < 6) {
        addToast({ title: "Validation Error", description: "Password must be at least 6 characters long.", type: "error" });
        setIsLoading(false);
        return;
      }

      if (cleanPassword !== confirmPassword) {
        addToast({ title: "Validation Error", description: "Passwords do not match.", type: "error" });
        setIsLoading(false);
        return;
      }

      const formattedPhone = cleanPhone.startsWith("+")
        ? cleanPhone
        : `+91${cleanPhone.replace(/^0+/, "")}`;

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            full_name: cleanName,
            phone: formattedPhone
          }
        }
      });

      if (error) {
        const msg = error.message.toLowerCase();
        const isDuplicate = msg.includes("already registered") || msg.includes("user already exists") || msg.includes("email_exists");

        if (isDuplicate) {
          addToast({
            title: "Account Exists",
            description: "This email is already registered. Please sign in to continue.",
            type: "info"
          });
          setIsLogin(true);
          setLoginMethod("password");
          setPassword("");
          setConfirmPassword("");
        } else {
          addToast({ title: "Registration Error", description: error.message, type: "error" });
        }
      } else if (signUpData?.user && (!signUpData.user.identities || signUpData.user.identities.length === 0)) {
        // Under Supabase Email Enumeration Protection, an existing account returns empty identities array.
        // Prevent duplicate account creation, prevent overwriting existing user data, and guide user to sign in.
        addToast({
          title: "Account Exists",
          description: "This email is already registered. Please sign in to continue.",
          type: "info"
        });
        setIsLogin(true);
        setLoginMethod("password");
        setPassword("");
        setConfirmPassword("");
      } else {
        // Genuinely new signup
        if (signUpData?.user) {
          await supabase.from("profiles").upsert({
            id: signUpData.user.id,
            email: cleanEmail,
            full_name: cleanName,
            phone: formattedPhone,
            role: "customer",
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });
        }

        addToast({
          title: "Verification Code Sent",
          description: "Please check your email for your 6-digit confirmation code.",
          type: "success",
        });
        setShowOTPVerification(true);
      }
    }

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      addToast({ title: "Validation Error", description: "Please enter your registered email address.", type: "error" });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
    });

    if (error) {
      addToast({ title: "Password Reset Request Failed", description: error.message, type: "error" });
    } else {
      setResetSent(true);
      addToast({ title: "Reset Link Dispatched", description: "Check your email inbox for password recovery instructions.", type: "success" });
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

        {/* Auth Card Container */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm sm:shadow-md transition-all">
          {/* Forgot Password Flow */}
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
                <div className="text-center">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">Reset Password</h1>
                  <p className="text-xs sm:text-sm text-foreground-secondary">
                    Enter your registered email address and we will send you password reset instructions.
                  </p>
                </div>

                {resetSent ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-foreground rounded-2xl p-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm sm:text-base">Check Your Email</h3>
                      <p className="text-xs text-foreground-secondary mt-1">
                        We sent password recovery instructions to <strong className="text-foreground">{email}</strong>.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setResetSent(false);
                        setIsLogin(true);
                      }}
                      className="w-full text-xs font-semibold h-11 rounded-xl"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" /> Return to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                    <div>
                      <label htmlFor="reset-email" className="block text-xs font-semibold text-foreground mb-1.5">
                        Email Address <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                        <input
                          id="reset-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          className="w-full h-11 sm:h-12 pl-10 pr-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                        />
                      </div>
                    </div>

                    <Button variant="primary" size="lg" type="submit" isLoading={isLoading} className="w-full h-11 sm:h-12 font-semibold text-sm rounded-xl mt-1">
                      Send Reset Instructions
                    </Button>

                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(false)}
                      className="text-xs font-semibold text-foreground-secondary hover:text-foreground flex items-center justify-center gap-1.5 mt-2 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                    </button>
                  </form>
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
                  type={isLogin ? "email" : "signup"}
                  onVerified={handleVerified}
                  onBack={() => setShowOTPVerification(false)}
                  title={isLogin ? "Verify Your Sign In" : "Verify your email"}
                  description={isLogin ? "We've sent a login code to your email." : "We've sent a 6-digit verification code to your email."}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              {/* Segmented Switch: Sign In vs Create Account */}
              <div className="grid grid-cols-2 p-1 bg-background-secondary rounded-xl mb-6 border border-border">
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setLoginMethod("password"); }}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                    isLogin
                      ? "bg-card text-foreground shadow-sm"
                      : "text-foreground-secondary hover:text-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                    !isLogin
                      ? "bg-card text-foreground shadow-sm"
                      : "text-foreground-secondary hover:text-foreground"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Title & Subtitle */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
                  {isLogin ? "Welcome back" : "Create your account"}
                </h1>
                <p className="text-xs sm:text-sm text-foreground-secondary">
                  {isLogin
                    ? "Sign in to continue shopping with VENDOSMITH."
                    : "Join VENDOSMITH and start shopping smarter."}
                </p>
              </div>

              {/* Form Content */}
              <AnimatePresence mode="wait">
                <motion.form
                  key={isLogin ? "login" : "register"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleAuth}
                  className="flex flex-col gap-4"
                >
                  {/* Login Method Toggle: Password vs OTP */}
                  {isLogin && (
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
                  )}

                  {/* Register Fields */}
                  {!isLogin && (
                    <>
                      {/* Full Name */}
                      <div>
                        <label htmlFor="reg-name" className="block text-xs font-semibold text-foreground mb-1.5">
                          Full Name <span className="text-destructive">*</span>
                        </label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                          <input
                            id="reg-name"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Rahul Sharma"
                            required
                            autoComplete="name"
                            className="w-full h-11 sm:h-12 pl-10 pr-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                          />
                        </div>
                      </div>

                      {/* Mobile Number with Indian Prefix */}
                      <div>
                        <label htmlFor="reg-phone" className="block text-xs font-semibold text-foreground mb-1.5">
                          Mobile Number <span className="text-destructive">*</span>
                        </label>
                        <div className="relative flex rounded-xl border border-border bg-background focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all overflow-hidden">
                          <span className="inline-flex items-center px-3 text-xs sm:text-sm font-semibold text-foreground bg-background-secondary border-r border-border select-none">
                            🇮🇳 +91
                          </span>
                          <input
                            id="reg-phone"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={10}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                            placeholder="98765 43210"
                            required
                            autoComplete="tel-national"
                            className="flex-1 h-11 sm:h-12 px-3 text-sm bg-transparent text-foreground outline-none placeholder:text-foreground-secondary/40"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Email Field */}
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-semibold text-foreground mb-1.5">
                      Email Address <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        autoComplete="email"
                        className="w-full h-11 sm:h-12 pl-10 pr-3.5 text-sm rounded-xl border border-border bg-background text-foreground focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-foreground-secondary/40"
                      />
                    </div>
                  </div>

                  {/* Password Field (for Password Login or Registration) */}
                  {(!isLogin || loginMethod === "password") && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="auth-password" className="block text-xs font-semibold text-foreground">
                          Password <span className="text-destructive">*</span>
                        </label>
                        {isLogin && (
                          <button
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="text-xs text-foreground-secondary hover:text-accent font-medium transition-colors"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={isLogin ? "Enter your password" : "At least 6 characters"}
                          required
                          autoComplete={isLogin ? "current-password" : "new-password"}
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

                  {/* Confirm Password (for Registration) */}
                  {!isLogin && (
                    <div>
                      <label htmlFor="reg-confirm-password" className="block text-xs font-semibold text-foreground mb-1.5">
                        Confirm Password <span className="text-destructive">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary/60" />
                        <input
                          id="reg-confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          required
                          autoComplete="new-password"
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
                    {isLogin ? (loginMethod === "password" ? "Sign In" : "Send Login Code") : "Create Account"}
                  </Button>

                  {/* Google OAuth (only for login or easy register) */}
                  <div className="relative flex items-center my-2">
                    <div className="flex-grow border-t border-border"></div>
                    <span className="flex-shrink-0 mx-3 text-foreground-secondary text-[11px] uppercase tracking-wider font-medium">or continue with</span>
                    <div className="flex-grow border-t border-border"></div>
                  </div>

                  <Button
                    variant="outline"
                    type="button"
                    size="lg"
                    className="w-full h-11 sm:h-12 flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold rounded-xl border-border hover:bg-background-secondary transition-colors"
                    onClick={handleGoogleOAuth}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </Button>

                  {/* Switch Action Links */}
                  <div className="text-center pt-2 text-xs text-foreground-secondary">
                    {isLogin ? (
                      <p>
                        New to VENDOSMITH?{" "}
                        <button
                          type="button"
                          onClick={() => setIsLogin(false)}
                          className="font-semibold text-accent hover:text-accent-hover transition-colors underline underline-offset-2"
                        >
                          Create an account
                        </button>
                      </p>
                    ) : (
                      <p>
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => { setIsLogin(true); setLoginMethod("password"); }}
                          className="font-semibold text-accent hover:text-accent-hover transition-colors underline underline-offset-2"
                        >
                          Sign in
                        </button>
                      </p>
                    )}
                  </div>
                </motion.form>
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Footer Hint / Seller Link */}
        <div className="text-center mt-6 text-xs text-foreground-secondary">
          <span>Are you a merchant? </span>
          <Link href="/seller/login" className="font-semibold text-foreground hover:text-accent transition-colors underline underline-offset-2">
            Sign in as Seller
          </Link>
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
