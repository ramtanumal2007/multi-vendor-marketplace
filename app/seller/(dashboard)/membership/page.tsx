export const dynamic = "force-dynamic";

import React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MembershipPlan, MembershipStatus, DbFeeRule } from "@/lib/membership";
import MembershipClientView from "./MembershipClientView";

export default async function SellerMembershipPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/seller/login");

  // Server-side evaluate expiry / grace period via RPC
  await supabase.rpc("check_seller_membership_status", {
    p_seller_id: session.user.id,
  });

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("business_name, membership_plan, membership_status, membership_expires_at")
    .eq("id", session.user.id)
    .single();

  const currentPlan: MembershipPlan = (sellerProfile?.membership_plan as MembershipPlan) || "BASIC";
  const membershipStatus: MembershipStatus = (sellerProfile?.membership_status as MembershipStatus) || "active";
  const membershipExpiresAt: string | null = sellerProfile?.membership_expires_at || null;

  // Determine if seller is within 7-day grace period
  let isInGracePeriod = false;
  if (membershipStatus === "past_due") {
    isInGracePeriod = true;
  } else if (membershipExpiresAt && currentPlan !== "BASIC") {
    const expiresDate = new Date(membershipExpiresAt).getTime();
    const now = Date.now();
    const graceEnd = expiresDate + 7 * 24 * 60 * 60 * 1000;
    if (now > expiresDate && now <= graceEnd) {
      isInGracePeriod = true;
    }
  }

  // Fetch live fee rules for authoritative plan display
  const { data: feeRulesData } = await supabase
    .from("marketplace_fee_rules")
    .select("*");

  const feeRules: Record<string, DbFeeRule> = {};
  if (feeRulesData) {
    for (const rule of feeRulesData) {
      if (rule.membership_plan) {
        feeRules[rule.membership_plan] = rule as unknown as DbFeeRule;
      }
    }
  }

  return (
    <MembershipClientView
      currentPlan={currentPlan}
      membershipStatus={membershipStatus}
      membershipExpiresAt={membershipExpiresAt}
      isInGracePeriod={isInGracePeriod}
      businessName={sellerProfile?.business_name || ""}
      feeRules={feeRules}
    />
  );
}
