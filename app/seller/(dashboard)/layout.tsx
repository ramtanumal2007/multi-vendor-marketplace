import { ReactNode } from "react";
import Link from "next/link";
import { Store, Package, ShoppingCart, User, LogOut, LayoutDashboard, ClipboardList, Zap } from "lucide-react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SellerNotificationCenter } from "@/components/seller/SellerNotificationCenter";

export default async function SellerDashboardLayout({ children }: { children: ReactNode }) {
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

  if (profile?.role !== "seller" && profile?.role !== "admin") {
    redirect("/seller/onboarding");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:block">
        <div className="h-full flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-100">
              <Link href="/seller" className="flex items-center space-x-2.5 font-extrabold text-xl text-slate-900">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                  <Store className="h-5 w-5" />
                </div>
                <span>Seller Hub</span>
              </Link>
            </div>
            <nav className="p-4 space-y-1">
              <Link href="/seller" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <LayoutDashboard className="h-4 w-4 mr-3 text-slate-500" />
                Dashboard
              </Link>
              <Link href="/seller/store" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <Store className="h-4 w-4 mr-3 text-slate-500" />
                My Store
              </Link>
              <Link href="/seller/products" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <Package className="h-4 w-4 mr-3 text-slate-500" />
                Products
              </Link>
              <Link href="/seller/orders" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <ShoppingCart className="h-4 w-4 mr-3 text-slate-500" />
                Orders
              </Link>
              <Link href="/seller/membership" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <Zap className="h-4 w-4 mr-3 text-amber-500" />
                Membership
              </Link>
              <Link href="/seller/tracking" className="flex items-center px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                <ClipboardList className="h-4 w-4 mr-3 text-slate-500" />
                Application Tracking
              </Link>
            </nav>
          </div>

          <div className="p-4 border-t border-slate-200">
            <Link href="/account" className="flex items-center px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all mb-1">
              <User className="h-4 w-4 mr-3 text-slate-400" />
              Back to Customer Account
            </Link>
            <form action="/auth/signout" method="post">
              <button className="flex w-full items-center px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all">
                <LogOut className="h-4 w-4 mr-3 text-red-500" />
                Logout
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-xs">
          <Link href="/seller" className="flex items-center space-x-2 font-bold text-lg text-slate-800 md:hidden">
            <Store className="h-5 w-5 text-blue-600" />
            <span>Seller Hub</span>
          </Link>

          <div className="hidden md:block text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Partner Portal Dashboard
          </div>

          <div className="flex items-center space-x-4">
            <SellerNotificationCenter sellerId={user.id} />
          </div>
        </header>

        <div className="p-6 md:p-8 max-w-7xl w-full mx-auto flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
