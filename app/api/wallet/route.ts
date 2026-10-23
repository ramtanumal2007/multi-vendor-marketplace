import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient as createSupabaseAdminClient, validateSupabaseConfig } from "@/lib/supabase";
import { getOrCreateCustomerWallet, getCustomerWalletTransactions } from "@/lib/wallet-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/wallet
 * Returns current customer wallet balance and ledger transaction log.
 */
export async function GET() {
  try {
    const cookieStore = cookies();
    validateSupabaseConfig();
    const supabaseUser = createServerClient(
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
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const wallet = await getOrCreateCustomerWallet(supabaseAdmin, user.id);
    const transactions = await getCustomerWalletTransactions(supabaseAdmin, user.id);

    return NextResponse.json({
      success: true,
      wallet,
      transactions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
