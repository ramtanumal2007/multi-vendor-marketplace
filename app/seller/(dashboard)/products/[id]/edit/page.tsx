import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import EditProductForm from "./EditProductForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function EditProductPage({ params }: { params: { id: string } }) {
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

  // Fetch seller profile to verify approval status
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("verification_status")
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

  // Fetch product for this store
  const { data: product } = await supabase
    .from("products")
    .select("*, product_images(id, image_url)")
    .eq("id", params.id)
    .eq("store_id", store.id)
    .single();

  if (!product) {
    redirect("/seller/products");
  }

  // Fetch categories for the form
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div>
      <div className="mb-6">
        <Link href="/seller/products" className="text-sm text-blue-600 hover:text-blue-800 flex items-center mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Products
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-gray-500 mt-1">Update your product details and pricing.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <EditProductForm product={product} categories={categories || []} />
      </div>
    </div>
  );
}
