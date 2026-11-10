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
  fullName: string | null;
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
  fullName: null,
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
  const [fullName, setFullName] = useState<string | null>(null);
  const supabase = createClient();

  const resolveSellerStatus = async (userId: string | undefined) => {
    if (!userId) {
      setIsApprovedSeller(false);
      setIsPendingSeller(false);
      setSellerStatus(null);
      setRole(null);
      setFullName(null);
      return;
    }

    try {
      const [profileRes, sellerRes] = await Promise.all([
        supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
        supabase.from("seller_profiles").select("verification_status").eq("id", userId).maybeSingle()
      ]);

      const userRole = profileRes.data?.role || null;
      const userName = profileRes.data?.full_name || null;
      const status = sellerRes.data?.verification_status || null;

      setRole(userRole);
      setFullName(userName);
      setSellerStatus(status);

      // Approved seller status MUST be based strictly on seller_profiles.verification_status === "approved"
      const isApproved = status === "approved";
      // Pending status includes pending review and correction states
      const isPending = !isApproved && (status === "pending" || status === "under_review" || status === "correction_required");

      setIsApprovedSeller(isApproved);
      setIsPendingSeller(isPending);
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
      setFullName(null);
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
          setFullName(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        fullName,
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
