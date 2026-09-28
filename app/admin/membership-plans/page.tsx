export const dynamic = "force-dynamic";

import React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { MembershipPlansAdminClient } from "./MembershipPlansAdminClient";
import { DbFeeRule } from "@/lib/membership";

export default async function AdminMembershipPlansPage() {
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

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/login?redirect=/admin/membership-plans");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: feeRules, error } = await supabaseAdmin
    .from("marketplace_fee_rules")
    .select(`
      id,
      membership_plan,
      display_name,
      description,
      active,
      monthly_price,
      yearly_price,
      max_products,
      storage_limit_mb,
      admin_users_limit,
      seller_coupons_enabled,
      bulk_csv_enabled,
      ranking_boost_level,
      commission_rate,
      billing_duration,
      grace_period_days,
      min_payout_amount,
      escrow_hold_days,
      gst_rate,
      tcs_rate,
      tds_rate,
      platform_absorbs_coupons,
      created_at,
      updated_at,
      updated_by,
      profiles:updated_by (
        full_name,
        email
      )
    `)
    .order("monthly_price", { ascending: true });

  if (error) {
    console.error("Error loading fee rules:", error);
  }

  // Ensure 3 default tiers if table empty
  const defaultTiers: DbFeeRule[] = [
    {
      id: "default-basic",
      membership_plan: "BASIC",
      display_name: "Basic Starter",
      description: "Essential tools for emerging sellers starting their eCommerce journey.",
      active: true,
      monthly_price: 0,
      yearly_price: 0,
      max_products: 10,
      storage_limit_mb: 500,
      admin_users_limit: 1,
      seller_coupons_enabled: false,
      bulk_csv_enabled: false,
      ranking_boost_level: "Standard",
      commission_rate: 0.12,
      billing_duration: "Free Lifetime",
      grace_period_days: 7,
      min_payout_amount: 1000,
      escrow_hold_days: 7,
      gst_rate: 0.18,
      tcs_rate: 0.005,
      tds_rate: 0.001,
      platform_absorbs_coupons: true,
    },
    {
      id: "default-pro",
      membership_plan: "PRO",
      display_name: "Professional Growth",
      description: "Ideal for scaling brands wanting unlimited products, bulk tools, and lower commission.",
      active: true,
      monthly_price: 1999,
      yearly_price: 19999,
      max_products: null,
      storage_limit_mb: 10240,
      admin_users_limit: 5,
      seller_coupons_enabled: true,
      bulk_csv_enabled: true,
      ranking_boost_level: "High",
      commission_rate: 0.08,
      billing_duration: "Monthly / Yearly",
      grace_period_days: 7,
      min_payout_amount: 1000,
      escrow_hold_days: 7,
      gst_rate: 0.18,
      tcs_rate: 0.005,
      tds_rate: 0.001,
      platform_absorbs_coupons: true,
    },
    {
      id: "default-business",
      membership_plan: "BUSINESS",
      display_name: "Enterprise Business",
      description: "Maximum performance tier with lowest 5% commission rate, dedicated support, and top ranking boost.",
      active: true,
      monthly_price: 4999,
      yearly_price: 49999,
      max_products: null,
      storage_limit_mb: 102400,
      admin_users_limit: null,
      seller_coupons_enabled: true,
      bulk_csv_enabled: true,
      ranking_boost_level: "Priority Boost",
      commission_rate: 0.05,
      billing_duration: "Monthly / Yearly",
      grace_period_days: 7,
      min_payout_amount: 1000,
      escrow_hold_days: 7,
      gst_rate: 0.18,
      tcs_rate: 0.005,
      tds_rate: 0.001,
      platform_absorbs_coupons: true,
    },
  ];

  const plansToRender = (feeRules && feeRules.length > 0) ? (feeRules as unknown as DbFeeRule[]) : defaultTiers;

  return (
    <div className="py-2">
      <MembershipPlansAdminClient initialPlans={plansToRender} />
    </div>
  );
}
