import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    // 1. Authenticate Admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    // Try RPC first
    const { data: rpcAccounts, error: rpcErr } = await supabase.rpc("admin_get_all_bank_accounts");

    interface RawBankRow {
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
        upi_id?: string | null;
        upi_qr_url?: string | null;
      } | null;
    }

    let accountsList: Array<{
      id: string;
      seller_id: string;
      seller_business_name: string;
      seller_contact_name: string;
      seller_email: string;
      seller_upi_id?: string | null;
      seller_upi_qr_url?: string | null;
      store_id: string | null;
      store_name: string;
      store_slug: string;
      account_holder_name: string;
      bank_name: string;
      branch_name?: string | null;
      ifsc_code: string;
      account_number_last4: string;
      account_type: "SAVINGS" | "CURRENT";
      is_primary: boolean;
      status: string;
      rejection_reason?: string | null;
      correction_reason?: string | null;
      admin_notes?: string | null;
      verified_at?: string | null;
      verified_by?: string | null;
      created_at: string;
      updated_at?: string | null;
    }> = [];

    if (!rpcErr && rpcAccounts) {
      accountsList = rpcAccounts;
    } else {
      // Fallback query using service_role to ensure accurate joins
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

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
            business_email,
            upi_id,
            upi_qr_url
          )
        `)
        .order("created_at", { ascending: false });

      if (queryErr) {
        console.error("Admin bank accounts query error:", queryErr);
        return NextResponse.json({ success: false, message: queryErr.message }, { status: 500 });
      }

      const typedRaw = (rawAccounts || []) as unknown as RawBankRow[];

      // Fetch store details
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
          seller_upi_id: acc.seller_profiles?.upi_id || null,
          seller_upi_qr_url: acc.seller_profiles?.upi_qr_url || null,
          store_id: store?.id || null,
          store_name: store?.name || acc.seller_profiles?.business_name || "Main Store",
          store_slug: store?.slug || "",
          account_holder_name: acc.account_holder_name,
          bank_name: acc.bank_name,
          branch_name: acc.branch_name,
          ifsc_code: acc.ifsc_code,
          account_number_last4: acc.account_number_last4,
          account_type: acc.account_type,
          is_primary: acc.is_primary,
          status: acc.status,
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

    // Generate fresh 300-second short-lived signed URLs for any private QR images
    const supabaseAdminForSigned = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    accountsList = await Promise.all(
      accountsList.map(async (acc) => {
        let qr = acc.seller_upi_qr_url;
        if (qr) {
          try {
            if (!qr.startsWith("http")) {
              const { data: signedData } = await supabaseAdminForSigned.storage
                .from("seller-payment-docs")
                .createSignedUrl(qr, 300);
              if (signedData?.signedUrl) qr = signedData.signedUrl;
            } else if (qr.includes("seller-payment-docs")) {
              const path = qr.split("seller-payment-docs/")[1]?.split("?")[0];
              if (path) {
                const { data: signedData } = await supabaseAdminForSigned.storage
                  .from("seller-payment-docs")
                  .createSignedUrl(path, 300);
                if (signedData?.signedUrl) qr = signedData.signedUrl;
              }
            }
          } catch {
            // Keep original on fallback
          }
        }
        return { ...acc, seller_upi_qr_url: qr };
      })
    );

    // Compute metrics
    const metrics = {
      total: accountsList.length,
      pending: accountsList.filter((a) => a.status === "pending").length,
      correction_required: accountsList.filter((a) => a.status === "correction_required").length,
      verified: accountsList.filter((a) => a.status === "verified").length,
      rejected: accountsList.filter((a) => a.status === "rejected").length,
      archived: accountsList.filter((a) => a.status === "archived").length,
    };

    return NextResponse.json({
      success: true,
      metrics,
      accounts: accountsList,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Admin bank accounts GET error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
