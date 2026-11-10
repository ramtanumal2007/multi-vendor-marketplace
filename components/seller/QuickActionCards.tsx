"use client";

import React from "react";
import Link from "next/link";
import { Plus, ShoppingCart, Tag, Zap, Store, ArrowUpRight } from "lucide-react";
import { DownloadCertificateButton } from "./DownloadCertificateButton";

interface QuickActionCardsProps {
  sellerProfile: Record<string, unknown> | null;
  store: Record<string, unknown> | null;
  productCount: number;
}

export function QuickActionCards({ sellerProfile, store, productCount }: QuickActionCardsProps) {
  const maxLimit = typeof sellerProfile?.max_products === "number" ? sellerProfile.max_products : 10;
  const isLimitReached = (sellerProfile?.membership_plan || "BASIC") === "BASIC" && productCount >= maxLimit;

  const actions = [
    {
      title: "Add New Product",
      description: "List a new item in your store catalog",
      icon: Plus,
      href: "/seller/products/new",
      color: "bg-blue-500/10 text-blue-600 border-blue-200 hover:border-blue-400",
      disabled: isLimitReached,
      disabledTooltip: `Product limit reached (${productCount}/${maxLimit})`,
    },
    {
      title: "Manage Orders",
      description: "View pending customer orders and shipments",
      icon: ShoppingCart,
      href: "/seller/orders",
      color: "bg-amber-500/10 text-amber-600 border-amber-200 hover:border-amber-400",
    },
    {
      title: "Store Coupons",
      description: "Manage discount codes for your customers",
      icon: Tag,
      href: "/seller/coupons",
      color: "bg-purple-500/10 text-purple-600 border-purple-200 hover:border-purple-400",
    },
    {
      title: "Upgrade Membership",
      description: "Unlock unlimited products & premium features",
      icon: Zap,
      href: "/seller/membership",
      color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:border-emerald-400",
    },
    {
      title: "Store Branding & Settings",
      description: "Update logo, tagline, colors, and about info",
      icon: Store,
      href: "/seller/store",
      color: "bg-slate-500/10 text-slate-700 border-slate-200 hover:border-slate-400",
    },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((action, i) => (
          <div key={i}>
            {action.disabled ? (
              <div
                title={action.disabledTooltip}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm opacity-60 cursor-not-allowed flex items-start justify-between"
              >
                <div>
                  <div className={`p-2.5 rounded-lg w-fit mb-3 ${action.color}`}>
                    <action.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">{action.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{action.description}</p>
                </div>
              </div>
            ) : (
              <Link
                href={action.href}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex items-start justify-between"
              >
                <div>
                  <div className={`p-2.5 rounded-lg w-fit mb-3 transition-transform group-hover:scale-105 ${action.color}`}>
                    <action.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors flex items-center">
                    {action.title} <ArrowUpRight className="w-3.5 h-3.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{action.description}</p>
                </div>
              </Link>
            )}
          </div>
        ))}

        {/* Certificate Download Card */}
        <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 p-5 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-2.5 rounded-lg w-fit mb-3 bg-amber-500/20 text-amber-700">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Download Certificate</h3>
            <p className="text-xs text-slate-600 mt-1">Export official PDF verified seller certificate</p>
          </div>
          <div className="mt-4">
            <DownloadCertificateButton
              sellerIdCode={(sellerProfile?.seller_id_code as string) || "SLR-000000"}
              storeName={(store?.name as string) || "Official Store"}
              businessName={sellerProfile?.business_name as string | undefined}
              contactName={sellerProfile?.contact_name as string | undefined}
              approvalDate={sellerProfile?.approved_at as string | undefined}
              status={sellerProfile?.verification_status as string | undefined}
              variant="outline"
              className="w-full text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
