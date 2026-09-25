"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isApprovedSeller: boolean;
  isPendingSeller: boolean;
  sellerStatus: string | null;
  role: string | null;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isApprovedSeller: false,
  isPendingSeller: false,
  sellerStatus: null,
  role: null,
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApprovedSeller, setIsApprovedSeller] = useState(false);
  const [isPendingSeller, setIsPendingSeller] = useState(false);
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const supabase = createClient();

  const resolveSellerStatus = async (userId: string | undefined) => {
    if (!userId) {
      setIsApprovedSeller(false);
      setIsPendingSeller(false);
      setSellerStatus(null);
      setRole(null);
      return;
    }

    try {
      const [profileRes, sellerRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.from("seller_profiles").select("verification_status").eq("id", userId).maybeSingle()
      ]);

      const userRole = profileRes.data?.role || null;
      const status = sellerRes.data?.verification_status || null;

      setRole(userRole);
      setSellerStatus(status);

      if (userRole === "admin" || userRole === "seller" || status === "approved") {
        setIsApprovedSeller(true);
        setIsPendingSeller(false);
      } else if (sellerRes.data) {
        setIsApprovedSeller(false);
        setIsPendingSeller(true);
      } else {
        setIsApprovedSeller(false);
        setIsPendingSeller(false);
      }
    } catch {
      // In case of error, default to safe customer state
      setIsApprovedSeller(false);
      setIsPendingSeller(false);
    }
  };

  const fetchSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      await resolveSellerStatus(session.user.id);
    } else {
      setIsApprovedSeller(false);
      setIsPendingSeller(false);
      setSellerStatus(null);
      setRole(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await resolveSellerStatus(session.user.id);
        } else {
          setIsApprovedSeller(false);
          setIsPendingSeller(false);
          setSellerStatus(null);
          setRole(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isApprovedSeller,
        isPendingSeller,
        sellerStatus,
        role,
        refreshAuth: fetchSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
