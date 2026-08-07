import React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { MEMBERSHIP_PLANS, MembershipPlan } from "@/lib/membership";

export default async function SellerMembershipPage() {
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

  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  const currentPlan: MembershipPlan = sellerProfile?.membership_plan || "BASIC";

  const plansList: MembershipPlan[] = ["BASIC", "PRO", "BUSINESS"];

  return (
    <div className="max-w-6xl mx-auto py-4">
      <div className="text-center mb-10">
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          Membership Architecture
        </span>
        <h1 className="text-3xl font-extrabold text-slate-900 mt-2">Seller Partner Plans & Tier Comparison</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-xl mx-auto">
          Scale your e-commerce store with higher product limits, dedicated storage, seller coupons, and premium support.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {plansList.map((planKey) => {
          const plan = MEMBERSHIP_PLANS[planKey];
          const isCurrent = currentPlan === planKey;

          return (
            <div
              key={planKey}
              className={`bg-white rounded-2xl border p-8 flex flex-col justify-between relative transition-all shadow-sm hover:shadow-lg ${
                isCurrent ? "border-blue-600 ring-2 ring-blue-600/20" : "border-slate-200"
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  Active Current Plan
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-slate-900">{plan.displayName}</h2>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${plan.badgeColor}`}>
                    {plan.name}
                  </span>
                </div>

                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-slate-900">{plan.priceMonthly}</span>
                </div>

                <ul className="space-y-3 text-xs text-slate-700 mb-8 border-t border-slate-100 pt-6">
                  <li className="flex items-center font-medium">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Max Products: <strong className="ml-1 font-bold text-slate-900">{plan.maxProducts === null ? "Unlimited" : `${plan.maxProducts} Products`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Storage Limit: <strong className="ml-1 font-bold text-slate-900">{plan.storageLimitMB >= 1024 ? `${plan.storageLimitMB / 1024} GB` : `${plan.storageLimitMB} MB`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-emerald-600 mr-2 flex-shrink-0" />
                    Store Admin Users: <strong className="ml-1 font-bold text-slate-900">{plan.adminUsersLimit === null ? "Unlimited" : `${plan.adminUsersLimit} Admin`}</strong>
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.canCreateCoupons ? "text-emerald-600" : "text-slate-300"}`} />
                    Seller Created Coupons
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.featuredStore ? "text-emerald-600" : "text-slate-300"}`} />
                    Featured Store Placement
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.bulkUpload ? "text-emerald-600" : "text-slate-300"}`} />
                    Bulk Upload Catalog Tools
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.betterSearchRanking ? "text-emerald-600" : "text-slate-300"}`} />
                    Search Ranking Boost
                  </li>

                  <li className="flex items-center">
                    <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${plan.apiAccess ? "text-emerald-600" : "text-slate-300"}`} />
                    API Access Integration
                  </li>
                </ul>
              </div>

              {isCurrent ? (
                <button
                  disabled
                  className="w-full bg-slate-100 text-slate-500 font-bold py-2.5 px-4 rounded-xl text-xs text-center cursor-default"
                >
                  Your Active Plan
                </button>
              ) : (
                <button
                  onClick={() => alert("Payment gateway integration will be added in future payment phase.")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs text-center transition-all shadow-md flex items-center justify-center gap-2"
                >
                  Upgrade to {plan.name} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
