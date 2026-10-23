import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { getAdminProductFinancialCalculator } from "@/lib/admin-finance-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/calculator/export
 * Generates an auditable, sanitised CSV export of the product and settlement report.
 */
export async function GET(req: Request) {
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
              // ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return new Response("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const sellerId = searchParams.get("sellerId") || "ALL";
    const status = searchParams.get("status") || "ALL";

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { rows } = await getAdminProductFinancialCalculator(supabaseAdmin, {
      startDate,
      endDate,
      sellerId,
      status,
    });

    const headers = [
      "Product Name",
      "SKU",
      "Seller Name",
      "Units Sold",
      "Gross Sales (INR)",
      "Platform Coupon (INR)",
      "Platform Commission (INR)",
      "GST on Commission (INR)",
      "TCS (INR)",
      "TDS (INR)",
      "Net Seller Payable (INR)",
      "Orders Count",
    ];

    const csvLines = [headers.join(",")];

    for (const r of rows) {
      const escape = (val: string | number | null | undefined) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      csvLines.push([
        escape(r.productTitle),
        escape(r.sku || "N/A"),
        escape(r.sellerName),
        r.totalQuantity,
        r.grossAmount.toFixed(2),
        r.platformCouponContribution.toFixed(2),
        r.commissionAmount.toFixed(2),
        r.gstOnCommission.toFixed(2),
        r.tcsAmount.toFixed(2),
        r.tdsAmount.toFixed(2),
        r.netSellerPayable.toFixed(2),
        r.orderCount,
      ].join(","));
    }

    const csvOutput = csvLines.join("\n");
    const filename = `Vendosmith_Settlement_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvOutput, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export CSV error:", err);
    return new Response("Export failed", { status: 500 });
  }
}
