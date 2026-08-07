"use client";

import React from "react";
import { Award, CheckCircle, Package, Layers, Zap, Lock } from "lucide-react";

interface SellerAchievementsWidgetProps {
  unlockedCodes?: string[];
}

export function SellerAchievementsWidget({ unlockedCodes = ["STORE_APPROVED"] }: SellerAchievementsWidgetProps) {
  const achievements = [
    {
      code: "STORE_APPROVED",
      title: "Verified Merchant",
      description: "Seller application verified & store approved",
      icon: CheckCircle,
      points: 20,
    },
    {
      code: "FIRST_PRODUCT",
      title: "Product Launch",
      description: "Listed your first product catalog item",
      icon: Package,
      points: 15,
    },
    {
      code: "CATALOG_EXPANDER",
      title: "Catalog Builder",
      description: "Listed 5 or more active catalog items",
      icon: Layers,
      points: 25,
    },
    {
      code: "PRO_MEMBER",
      title: "Pro Tier Seller",
      description: "Upgraded to Pro or Business membership",
      icon: Zap,
      points: 40,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" /> Seller Achievements & Milestones
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Earn reputation points by completing seller milestones</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {achievements.map((ach) => {
          const isUnlocked = unlockedCodes.includes(ach.code);
          return (
            <div
              key={ach.code}
              className={`p-4 rounded-xl border transition-all flex items-start space-x-3 ${
                isUnlocked
                  ? "bg-amber-50/40 border-amber-200/80 shadow-sm"
                  : "bg-slate-50/50 border-slate-200/60 opacity-60"
              }`}
            >
              <div
                className={`p-2.5 rounded-lg flex-shrink-0 ${
                  isUnlocked ? "bg-amber-500 text-white shadow-md shadow-amber-500/20" : "bg-slate-200 text-slate-400"
                }`}
              >
                {isUnlocked ? <ach.icon className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">{ach.title}</h4>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    +{ach.points} pts
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">{ach.description}</p>
                <div className="mt-2 text-[10px] font-semibold">
                  {isUnlocked ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Unlocked
                    </span>
                  ) : (
                    <span className="text-slate-400">Locked</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
