import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Edit, PackageSearch, Lock, ShieldAlert, AlertTriangle, Zap } from "lucide-react";
import Image from "next/image";
import DeleteProductButton from "./DeleteProductButton";
import { getProductUsageStatus } from "@/lib/membership";

export default async function SellerProductsPage() {
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

  const isApprovedSeller = sellerProfile?.verification_status === "approved";
  const plan = sellerProfile?.membership_plan || "BASIC";

  // Fetch store to get store_id
  const { data: store } = await supabase
    .from("stores")
    .select("id, status")
    .eq("seller_id", session.user.id)
    .single();

  if (!store) {
    redirect("/seller/store");
  }

  // Fetch products
  const { data: products } = await supabase
    .from("products")
    .select("*, product_images(image_url)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const productList = products || [];
  const usage = getProductUsageStatus(productList.length, plan);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800";
      case "pending_review": return "bg-amber-100 text-amber-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "draft": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products Catalog</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your active products and inventory levels.</p>
        </div>

        {isApprovedSeller ? (
          usage.isLimitReached ? (
            <button
              disabled
              title="Product limit reached for BASIC membership plan"
              className="bg-slate-300 text-slate-500 font-medium py-2 px-4 rounded-lg flex items-center cursor-not-allowed opacity-75 text-sm"
            >
              <Lock className="h-4 w-4 mr-2" /> Add Product (Limit Reached)
            </button>
          ) : (
            <Link
              href="/seller/products/new"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition shadow-sm text-sm"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Product
            </Link>
          )
        ) : (
          <button
            disabled
            title="Seller approval required to add products"
            className="bg-slate-300 text-slate-500 font-medium py-2 px-4 rounded-lg flex items-center cursor-not-allowed opacity-75 text-sm"
          >
            <Lock className="h-4 w-4 mr-2" />
            Add Product (Locked)
          </button>
        )}
      </div>

      {/* Product Limit Warnings */}
      {usage.isLimitReached && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-800">
                  Product limit reached ({usage.currentProducts}/10).
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  You have reached the maximum catalog allowance for the BASIC plan. Upgrade to PRO to list unlimited products.
                </p>
              </div>
            </div>
            <Link href="/seller/membership" className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs flex-shrink-0 ml-4">
              <Zap className="w-3.5 h-3.5" /> Upgrade to PRO
            </Link>
          </div>
        </div>
      )}

      {usage.isWarning && !usage.isLimitReached && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-xl shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 mr-3 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Warning: You have used 9 of 10 product slots.
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Upgrade to PRO to add unlimited products and avoid catalog creation limits.
                </p>
              </div>
            </div>
            <Link href="/seller/membership" className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs flex-shrink-0 ml-4">
              <Zap className="w-3.5 h-3.5" /> Upgrade to PRO
            </Link>
          </div>
        </div>
      )}

      {!isApprovedSeller && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-xl">
          <div className="flex items-center">
            <ShieldAlert className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-700 font-medium">Seller Account Verification Required</p>
              <p className="text-xs text-red-600 mt-0.5">
                Your seller application status is <strong>{sellerProfile?.verification_status || "unverified"}</strong>. Only approved sellers can create or publish new products.
              </p>
            </div>
          </div>
        </div>
      )}

      {productList.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider">Product</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider">Price</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider">Stock</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {productList.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">
                          {product.product_images && product.product_images[0] ? (
                            <Image
                              src={product.product_images[0].image_url}
                              alt={product.title}
                              width={40}
                              height={40}
                              className="object-cover h-10 w-10"
                            />
                          ) : (
                            <PackageSearch className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="font-bold text-slate-900">{product.title}</div>
                          <div className="text-xs text-slate-400">SKU: {product.sku || "N/A"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-800">
                      ${product.price}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs font-semibold ${product.stock_quantity === 0 ? "text-red-600" : product.stock_quantity <= 5 ? "text-amber-600" : "text-slate-700"}`}>
                        {product.stock_quantity} units
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(product.status)}`}>
                        {product.status.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                      <div className="flex justify-end gap-3 items-center">
                        <Link href={`/seller/products/${product.id}/edit`} className="text-blue-600 hover:text-blue-900 inline-flex items-center text-xs">
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                        </Link>
                        <DeleteProductButton productId={product.id} productTitle={product.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
          <PackageSearch className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No products found</h3>
          <p className="text-slate-500 text-sm mb-6">
            {isApprovedSeller ? "Get started by creating your first catalog product." : "Complete seller approval to create products."}
          </p>
          {isApprovedSeller && !usage.isLimitReached && (
            <Link
              href="/seller/products/new"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center transition text-sm shadow-sm"
            >
              <Plus className="h-5 w-5 mr-2" /> Add Product
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
