import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Store } from "lucide-react";
import Link from "next/link";
import { SellerDashboardHero } from "@/components/seller/SellerDashboardHero";
import { QuickActionCards } from "@/components/seller/QuickActionCards";
import { SellerAnalyticsWidget } from "@/components/seller/SellerAnalyticsWidget";
import { InventoryHealthCard } from "@/components/seller/InventoryHealthCard";
import { SellerAchievementsWidget } from "@/components/seller/SellerAchievementsWidget";
import { SellerApprovalModalWrapper } from "@/components/seller/SellerApprovalModalWrapper";

export default async function SellerDashboardPage() {
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

  if (!session) return null;

  const sellerId = session.user.id;

  // 1. Fetch seller profile
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("id", sellerId)
    .single();

  // 2. Fetch store details
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("seller_id", sellerId)
    .single();

  if (!store) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-xl mx-auto my-12 text-center p-8">
        <div className="p-4 bg-blue-50 text-blue-600 rounded-full mb-4">
          <Store className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to the Seller Partner Portal</h2>
        <p className="text-slate-500 mb-6 max-w-md text-sm">
          You have successfully registered. Complete your store profile to start listing products and receiving customer orders.
        </p>
        <Link href="/seller/store" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md text-sm">
          Set Up My Store
        </Link>
      </div>
    );
  }

  // 3. Fetch store products for inventory health & count
  const { data: products } = await supabase
    .from("products")
    .select("id, title, price, stock_quantity, status")
    .eq("store_id", store.id);

  const productList = products || [];
  const productCount = productList.length;

  // 4. Dedicated Analytics RPCs (Summary, Today, Weekly, Monthly)
  let summaryStats = { totalRevenue: 0, totalOrders: 0, conversionRate: 0, pendingPayout: 0, completedPayouts: 0 };
  let todayStats = { todaySales: 0, todayOrders: 0, todayVisitors: 0, pendingShipments: 0 };
  let weeklyStats = { weeklyRevenue: 0, weeklyOrders: 0, weeklyViews: 0 };
  let monthlyStats = { monthlyRevenue: 0, monthlyOrders: 0, monthlyViews: 0 };

  try {
    const [summaryRes, todayRes, weeklyRes, monthlyRes] = await Promise.all([
      supabase.rpc("get_dashboard_summary", { p_seller_id: sellerId }),
      supabase.rpc("get_today_stats", { p_seller_id: sellerId }),
      supabase.rpc("get_weekly_stats", { p_seller_id: sellerId }),
      supabase.rpc("get_monthly_stats", { p_seller_id: sellerId }),
    ]);

    if (summaryRes.data && summaryRes.data[0]) {
      summaryStats = {
        totalRevenue: Number(summaryRes.data[0].total_revenue || 0),
        totalOrders: Number(summaryRes.data[0].total_orders || 0),
        conversionRate: Number(summaryRes.data[0].conversion_rate || 0),
        pendingPayout: Number(summaryRes.data[0].pending_payout || 0),
        completedPayouts: Number(summaryRes.data[0].completed_payouts || 0),
      };
    }

    if (todayRes.data && todayRes.data[0]) {
      todayStats = {
        todaySales: Number(todayRes.data[0].today_sales || 0),
        todayOrders: Number(todayRes.data[0].today_orders || 0),
        todayVisitors: Number(todayRes.data[0].today_visitors || 0),
        pendingShipments: Number(todayRes.data[0].pending_shipments || 0),
      };
    }

    if (weeklyRes.data && weeklyRes.data[0]) {
      weeklyStats = {
        weeklyRevenue: Number(weeklyRes.data[0].weekly_revenue || 0),
        weeklyOrders: Number(weeklyRes.data[0].weekly_orders || 0),
        weeklyViews: Number(weeklyRes.data[0].weekly_views || 0),
      };
    }

    if (monthlyRes.data && monthlyRes.data[0]) {
      monthlyStats = {
        monthlyRevenue: Number(monthlyRes.data[0].monthly_revenue || 0),
        monthlyOrders: Number(monthlyRes.data[0].monthly_orders || 0),
        monthlyViews: Number(monthlyRes.data[0].monthly_views || 0),
      };
    }
  } catch {
    // Direct table query fallback if RPCs have not been deployed to DB yet
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("line_total, order_id, orders(payment_status, fulfillment_status, created_at)")
      .eq("store_id", store.id);

    if (orderItems) {
      const uniqueOrderIds = new Set<string>();
      let rev = 0;
      let pendingPay = 0;
      let completedPay = 0;
      let tSales = 0;
      const tOrders = new Set<string>();
      let pShipments = 0;

      const todayStr = new Date().toISOString().split("T")[0];

      orderItems.forEach((item: { line_total?: number; order_id?: string; orders?: Record<string, unknown> | Array<Record<string, unknown>> }) => {
        if (item.order_id) uniqueOrderIds.add(item.order_id);
        const price = Number(item.line_total || 0);
        rev += price;

        const ord = Array.isArray(item.orders) ? item.orders[0] : item.orders;
        if (ord) {
          const paymentStatus = ord.payment_status as string;
          const fulfillmentStatus = ord.fulfillment_status as string;
          const createdAt = ord.created_at as string;

          if (paymentStatus === "paid" && ["pending", "processing", "shipped"].includes(fulfillmentStatus)) {
            pendingPay += price;
          }
          if (fulfillmentStatus === "delivered") {
            completedPay++;
          }
          if (["pending", "processing"].includes(fulfillmentStatus)) {
            pShipments++;
          }
          if (createdAt && createdAt.startsWith(todayStr)) {
            tSales += price;
            if (item.order_id) tOrders.add(item.order_id);
          }
        }
      });

      summaryStats = {
        totalRevenue: rev,
        totalOrders: uniqueOrderIds.size,
        conversionRate: 0,
        pendingPayout: pendingPay,
        completedPayouts: completedPay,
      };

      todayStats = {
        todaySales: tSales,
        todayOrders: tOrders.size,
        todayVisitors: 0,
        pendingShipments: pShipments,
      };

      weeklyStats = { weeklyRevenue: rev, weeklyOrders: uniqueOrderIds.size, weeklyViews: 0 };
      monthlyStats = { monthlyRevenue: rev, monthlyOrders: uniqueOrderIds.size, monthlyViews: 0 };
    }
  }

  // 5. Achievements Auto-Unlock & Retrieval
  try {
    await supabase.rpc("check_and_unlock_seller_achievements", { p_seller_id: sellerId });
  } catch {
    // Direct table fallback for unlocked achievements
    const { data: achs } = await supabase.from("seller_achievements").select("id, code");
    if (achs && achs.length > 0) {
      const toUnlock: string[] = [];
      const storeApp = achs.find((a) => a.code === "STORE_APPROVED");
      const firstProd = achs.find((a) => a.code === "FIRST_PRODUCT");
      const catExp = achs.find((a) => a.code === "CATALOG_EXPANDER");
      const proMem = achs.find((a) => a.code === "PRO_MEMBER");

      if (storeApp && sellerProfile?.verification_status === "approved") toUnlock.push(storeApp.id);
      if (firstProd && productCount >= 1) toUnlock.push(firstProd.id);
      if (catExp && productCount >= 5) toUnlock.push(catExp.id);
      if (proMem && sellerProfile?.membership_plan && sellerProfile.membership_plan !== "BASIC") toUnlock.push(proMem.id);

      for (const achId of toUnlock) {
        await supabase
          .from("seller_unlocked_achievements")
          .insert({ seller_id: sellerId, achievement_id: achId })
          .select()
          .maybeSingle();
      }
    }
  }

  const { data: unlockedData } = await supabase
    .from("seller_unlocked_achievements")
    .select("achievement_id, seller_achievements(code)")
    .eq("seller_id", sellerId);

  const unlockedCodes = unlockedData
    ? (unlockedData.map((u: Record<string, unknown>) => {
        const sa = u.seller_achievements as { code?: string } | { code?: string }[] | null | undefined;
        return Array.isArray(sa) ? sa[0]?.code : sa?.code;
      }).filter(Boolean) as string[])
    : ["STORE_APPROVED"];

  const shouldShowModal = Boolean(
    sellerProfile?.verification_status === "approved" && !sellerProfile?.has_seen_approval_modal
  );

  return (
    <div>
      {/* 1. Welcome Popup (one-time logic) */}
      {shouldShowModal && (
        <SellerApprovalModalWrapper
          sellerIdCode={sellerProfile?.seller_id_code || "SLR-000001"}
          storeName={store.name}
          approvalDate={sellerProfile?.approved_at}
          businessName={sellerProfile?.business_name}
          contactName={sellerProfile?.contact_name}
        />
      )}

      {/* 2 - 8. Seller Dashboard Hero (Hero, Product usage, Membership limits, Store completion, Score, Level) */}
      <SellerDashboardHero
        sellerProfile={sellerProfile}
        store={store}
        productCount={productCount}
      />

      {/* Quick Action Cards */}
      <QuickActionCards
        sellerProfile={sellerProfile}
        store={store}
        productCount={productCount}
      />

      {/* 9. Analytics (Today's Snapshot, Weekly, Monthly, Revenue, Payouts) */}
      <SellerAnalyticsWidget
        summaryStats={summaryStats}
        todayStats={todayStats}
        weeklyStats={weeklyStats}
        monthlyStats={monthlyStats}
      />

      {/* 10. Inventory Health */}
      <InventoryHealthCard products={productList} />

      {/* 12. Seller Achievements */}
      <SellerAchievementsWidget unlockedCodes={unlockedCodes} />
    </div>
  );
}
