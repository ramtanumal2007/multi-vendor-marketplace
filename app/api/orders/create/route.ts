import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { createOrderRecord } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const paymentMethod = (body.paymentMethod || "COD").toUpperCase();
    const appliedWallet = Number(body.walletAmountApplied || 0);

    // 1. REJECT UNVERIFIED ONLINE ORDERS VIA PUBLIC CREATION ENDPOINT
    // Online orders can only be created as confirmed/paid via the authoritative Cashfree verification endpoint
    if (paymentMethod === "ONLINE") {
      return NextResponse.json(
        {
          success: false,
          message: "Online payments must be initiated and verified through the payment gateway endpoint.",
        },
        { status: 400 }
      );
    }

    // 2. DISALLOW CLIENT-SUPPLIED 'PAID' STATUS FOR NON-WALLET PAYMENTS
    if (body.paymentStatus === "paid" && paymentMethod !== "WALLET") {
      return NextResponse.json(
        {
          success: false,
          message: "Orders cannot be marked as paid directly through this endpoint.",
        },
        { status: 400 }
      );
    }

    // 3. ENFORCE AUTHENTICATION FOR WALLET USAGE
    if (paymentMethod === "WALLET" || appliedWallet > 0) {
      const cookieStore = cookies();
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
        return NextResponse.json(
          { success: false, message: "Authentication required to apply wallet balance." },
          { status: 401 }
        );
      }

      // Ensure caller cannot debit another customer's wallet
      if (body.userId && body.userId !== user.id) {
        return NextResponse.json(
          { success: false, message: "Unauthorized wallet usage. User ID mismatch." },
          { status: 403 }
        );
      }

      body.userId = user.id;
    }

    // For COD, enforce paymentStatus = 'pending'
    if (paymentMethod === "COD") {
      body.paymentStatus = "pending";
    }

    const result = await createOrderRecord(body);
    return NextResponse.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order.";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
