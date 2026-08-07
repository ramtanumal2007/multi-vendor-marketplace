export type MembershipPlan = "BASIC" | "PRO" | "BUSINESS";
export type MembershipStatus = "active" | "canceled" | "expired" | "past_due" | "trialing";

export interface PlanDetails {
  name: MembershipPlan;
  displayName: string;
  badgeColor: string;
  maxProducts: number | null; // null = unlimited
  storageLimitMB: number;
  adminUsersLimit: number | null; // null = unlimited
  analytics: "basic" | "premium" | "enterprise";
  support: "basic" | "priority" | "dedicated";
  featuredStore: boolean;
  bulkUpload: boolean;
  canCreateCoupons: boolean;
  betterSearchRanking: boolean;
  customBranding: boolean;
  apiAccess: boolean;
  priceMonthly: string;
}

export const MEMBERSHIP_PLANS: Record<MembershipPlan, PlanDetails> = {
  BASIC: {
    name: "BASIC",
    displayName: "Basic Plan",
    badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
    maxProducts: 10,
    storageLimitMB: 500,
    adminUsersLimit: 1,
    analytics: "basic",
    support: "basic",
    featuredStore: false,
    bulkUpload: false,
    canCreateCoupons: false,
    betterSearchRanking: false,
    customBranding: false,
    apiAccess: false,
    priceMonthly: "Free",
  },
  PRO: {
    name: "PRO",
    displayName: "Pro Seller Plan",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    maxProducts: null,
    storageLimitMB: 10240, // 10 GB
    adminUsersLimit: 5,
    analytics: "premium",
    support: "priority",
    featuredStore: true,
    bulkUpload: true,
    canCreateCoupons: true,
    betterSearchRanking: true,
    customBranding: true,
    apiAccess: false,
    priceMonthly: "$29/mo",
  },
  BUSINESS: {
    name: "BUSINESS",
    displayName: "Enterprise Business",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    maxProducts: null,
    storageLimitMB: 102400, // 100 GB
    adminUsersLimit: null,
    analytics: "enterprise",
    support: "dedicated",
    featuredStore: true,
    bulkUpload: true,
    canCreateCoupons: true,
    betterSearchRanking: true,
    customBranding: true,
    apiAccess: true,
    priceMonthly: "$99/mo",
  },
};

export interface UsageStatus {
  currentProducts: number;
  maxProducts: number | null;
  percentage: number;
  isWarning: boolean; // At 9 products (90%)
  isLimitReached: boolean; // At 10 products (100%)
  remainingSlots: number | null;
}

export function getProductUsageStatus(currentProducts: number, plan: MembershipPlan = "BASIC"): UsageStatus {
  const planInfo = MEMBERSHIP_PLANS[plan] || MEMBERSHIP_PLANS.BASIC;
  const max = planInfo.maxProducts;

  if (max === null) {
    return {
      currentProducts,
      maxProducts: null,
      percentage: 0,
      isWarning: false,
      isLimitReached: false,
      remainingSlots: null,
    };
  }

  const percentage = Math.min(100, Math.round((currentProducts / max) * 100));
  const remainingSlots = Math.max(0, max - currentProducts);
  const isWarning = currentProducts === max - 1; // 9 products on BASIC (90%)
  const isLimitReached = currentProducts >= max; // 10 or more products

  return {
    currentProducts,
    maxProducts: max,
    percentage,
    isWarning,
    isLimitReached,
    remainingSlots,
  };
}
