import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ProductForm from "./ProductForm";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Zap } from "lucide-react";
import { getProductUsageStatus } from "@/lib/membership";

export default async function NewProductPage() {
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

  if (!session) redirect("/login");

  // Fetch seller profile
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("verification_status, membership_plan")
    .eq("id", session.user.id)
    .single();

  if (!sellerProfile || sellerProfile.verification_status !== "approved") {
    redirect("/seller/products");
  }

  // Fetch store to get store_id
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("seller_id", session.user.id)
    .single();

  if (!store) {
    redirect("/seller/store");
  }

  // Count existing products
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id);

  const productCount = count || 0;
  const usage = getProductUsageStatus(productCount, sellerProfile.membership_plan || "BASIC");

  if (usage.isLimitReached) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-red-900 mb-2">Product Limit Reached (10/10)</h2>
          <p className="text-sm text-red-700 mb-6">
            You have reached the maximum catalog allowance for the BASIC membership plan. Upgrade to PRO to add unlimited products.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/seller/membership" className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> Upgrade to PRO
            </Link>
            <Link href="/seller/products" className="text-slate-600 hover:text-slate-900 font-medium px-4 py-2.5 text-sm">
              Back to Products Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fetch categories for form
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div>
      <div className="mb-6">
        <Link href="/seller/products" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Products
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="text-slate-500 text-sm mt-1">Create a new product listing for your store catalog.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ProductForm storeId={store.id} categories={categories || []} />
      </div>
    </div>
  );
}
