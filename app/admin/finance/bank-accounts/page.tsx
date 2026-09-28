export const dynamic = "force-dynamic";

import React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { AdminBankAccountsClient, AdminBankAccountItem } from "./AdminBankAccountsClient";

export default async function AdminBankAccountsPage() {
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
    redirect("/login?redirect=/admin/finance/bank-accounts");
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

  let accountsList: AdminBankAccountItem[] = [];

  // Try RPC first
  const { data: rpcAccounts, error: rpcErr } = await supabase.rpc("admin_get_all_bank_accounts");

  if (!rpcErr && rpcAccounts) {
    accountsList = rpcAccounts as unknown as AdminBankAccountItem[];
  } else {
    // Fallback query with service_role
    const { data: rawAccounts, error: queryErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select(`
        id,
        seller_id,
        account_holder_name,
        bank_name,
        branch_name,
        ifsc_code,
        account_number_last4,
        account_type,
        is_primary,
        status,
        rejection_reason,
        correction_reason,
        admin_notes,
        verified_at,
        verified_by,
        created_at,
        updated_at,
        seller_profiles!inner (
          id,
          business_name,
          contact_name,
          business_email
        )
      `)
      .order("created_at", { ascending: false });

    if (!queryErr && rawAccounts) {
      const typedRaw = rawAccounts as unknown as Array<{
        id: string;
        seller_id: string;
        account_holder_name: string;
        bank_name: string;
        branch_name: string | null;
        ifsc_code: string;
        account_number_last4: string;
        account_type: "SAVINGS" | "CURRENT";
        is_primary: boolean;
        status: "pending" | "correction_required" | "verified" | "rejected" | "archived";
        rejection_reason?: string | null;
        correction_reason?: string | null;
        admin_notes?: string | null;
        verified_at?: string | null;
        verified_by?: string | null;
        created_at: string;
        updated_at?: string | null;
        seller_profiles?: {
          id: string;
          business_name: string | null;
          contact_name: string | null;
          business_email: string | null;
        } | null;
      }>;

      const sellerIds = Array.from(new Set(typedRaw.map((a) => a.seller_id)));
      const { data: stores } = await supabaseAdmin
        .from("stores")
        .select("id, seller_id, name, slug")
        .in("seller_id", sellerIds);

      const storeMap = new Map((stores || []).map((s: { id: string; seller_id: string; name: string; slug: string }) => [s.seller_id, s]));

      accountsList = typedRaw.map((acc) => {
        const store = storeMap.get(acc.seller_id);
        return {
          id: acc.id,
          seller_id: acc.seller_id,
          seller_business_name: acc.seller_profiles?.business_name || "Unknown Seller",
          seller_contact_name: acc.seller_profiles?.contact_name || "",
          seller_email: acc.seller_profiles?.business_email || "",
          store_id: store?.id || null,
          store_name: store?.name || acc.seller_profiles?.business_name || "Main Store",
          store_slug: store?.slug || "",
          account_holder_name: acc.account_holder_name,
          bank_name: acc.bank_name,
          branch_name: acc.branch_name,
          ifsc_code: acc.ifsc_code,
          account_number_last4: acc.account_number_last4,
          account_type: acc.account_type || "CURRENT",
          is_primary: Boolean(acc.is_primary),
          status: acc.status || "pending",
          rejection_reason: acc.rejection_reason,
          correction_reason: acc.correction_reason,
          admin_notes: acc.admin_notes,
          verified_at: acc.verified_at,
          verified_by: acc.verified_by,
          created_at: acc.created_at,
          updated_at: acc.updated_at,
        };
      });
    }
  }

  const metrics = {
    total: accountsList.length,
    pending: accountsList.filter((a) => a.status === "pending").length,
    correction_required: accountsList.filter((a) => a.status === "correction_required").length,
    verified: accountsList.filter((a) => a.status === "verified").length,
    rejected: accountsList.filter((a) => a.status === "rejected").length,
    archived: accountsList.filter((a) => a.status === "archived").length,
  };

  return (
    <div className="py-2">
      <AdminBankAccountsClient
        initialAccounts={accountsList}
        initialMetrics={metrics}
      />
    </div>
  );
}
