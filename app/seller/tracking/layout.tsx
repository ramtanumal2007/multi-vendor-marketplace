import { ReactNode } from "react";
import Link from "next/link";
import { Store, Package, ShoppingCart, User, LogOut, LayoutDashboard, ClipboardList, Info } from "lucide-react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function TrackingLayout({ children }: { children: ReactNode }) {
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
    redirect("/seller/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("id, verification_status")
    .eq("id", user.id)
    .single();

  if (!sellerProfile) {
    // Normal customer without seller account
    redirect("/seller/onboarding");
  }

  const isApprovedSeller = profile?.role === "seller" || profile?.role === "admin";

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:block">
        <div className="h-full flex flex-col">
          <div className="p-6">
            <Link href={isApprovedSeller ? "/seller" : "/seller/tracking"} className="flex items-center space-x-2 font-bold text-xl text-gray-800">
              <Store className="h-6 w-6 text-blue-600" />
              <span>{isApprovedSeller ? "Seller Portal" : "Applicant Portal"}</span>
            </Link>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {isApprovedSeller ? (
              // Approved Seller Menu
              <>
                <Link href="/seller" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <LayoutDashboard className="h-5 w-5 mr-3" />
                  Dashboard
                </Link>
                <Link href="/seller/store" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <Store className="h-5 w-5 mr-3" />
                  My Store
                </Link>
                <Link href="/seller/products" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <Package className="h-5 w-5 mr-3" />
                  Products
                </Link>
                <Link href="/seller/orders" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <ShoppingCart className="h-5 w-5 mr-3" />
                  Orders
                </Link>
                <Link href="/seller/tracking" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <ClipboardList className="h-5 w-5 mr-3" />
                  Application Tracking
                </Link>
              </>
            ) : (
              // Applicant Menu
              <>
                <Link href="/seller/tracking" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <ClipboardList className="h-5 w-5 mr-3" />
                  Application Tracking
                </Link>
                <Link href="/seller/tracking/details" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
                  <Info className="h-5 w-5 mr-3" />
                  Application Details
                </Link>
              </>
            )}
          </nav>
          <div className="p-4 border-t border-gray-200">
            <Link href="/account" className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg">
              <User className="h-5 w-5 mr-3" />
              Back to Account
            </Link>
            <form action="/auth/signout" method="post">
              <button className="flex w-full items-center px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg">
                <LogOut className="h-5 w-5 mr-3" />
                Logout
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <header className="bg-white border-b border-gray-200 p-4 md:hidden flex justify-between items-center">
          <Link href={isApprovedSeller ? "/seller" : "/seller/tracking"} className="flex items-center space-x-2 font-bold text-lg text-gray-800">
            <Store className="h-5 w-5 text-blue-600" />
            <span>{isApprovedSeller ? "Seller Portal" : "Applicant Portal"}</span>
          </Link>
        </header>
        
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
