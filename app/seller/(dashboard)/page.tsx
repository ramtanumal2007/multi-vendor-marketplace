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

  // Fetch seller profile
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  // Fetch store details
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("seller_id", session.user.id)
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

  // Fetch store products
  const { data: products } = await supabase
    .from("products")
    .select("id, title, price, stock_quantity, status")
    .eq("store_id", store.id);

  const productList = products || [];
  const productCount = productList.length;

  // Fetch unlocked achievements
  const { data: unlockedData } = await supabase
    .from("seller_unlocked_achievements")
    .select("achievement_id, seller_achievements(code)")
    .eq("seller_id", session.user.id);

  const unlockedCodes = unlockedData
    ? unlockedData.map((u: { seller_achievements?: { code?: string } | null }) => u.seller_achievements?.code).filter(Boolean) as string[]
    : ["STORE_APPROVED"];

  const shouldShowModal = Boolean(
    sellerProfile?.verification_status === "approved" && !sellerProfile?.has_seen_approval_modal
  );

  return (
    <div>
      {/* One-Time Approval Modal Wrapper */}
      {shouldShowModal && (
        <SellerApprovalModalWrapper
          sellerIdCode={sellerProfile?.seller_id_code || "SLR-000001"}
          storeName={store.name}
          approvalDate={sellerProfile?.approved_at}
          businessName={sellerProfile?.business_name}
          contactName={sellerProfile?.contact_name}
        />
      )}

      {/* Seller Dashboard Hero */}
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

      {/* Analytics & Earnings */}
      <SellerAnalyticsWidget />

      {/* Inventory Health */}
      <InventoryHealthCard products={productList} />

      {/* Achievements */}
      <SellerAchievementsWidget unlockedCodes={unlockedCodes} />
    </div>
  );
}
