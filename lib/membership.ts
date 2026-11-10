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
  monthlyPriceINR: number;
  yearlyPriceINR: number;
  monthlyDisplay: string;
  yearlyDisplay: string;
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
    monthlyPriceINR: 0,
    yearlyPriceINR: 0,
    monthlyDisplay: "Free",
    yearlyDisplay: "Free",
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
    priceMonthly: "₹1,999/mo",
    monthlyPriceINR: 1999,
    yearlyPriceINR: 19999,
    monthlyDisplay: "₹1,999/mo",
    yearlyDisplay: "₹19,999/yr",
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
    priceMonthly: "₹4,999/mo",
    monthlyPriceINR: 4999,
    yearlyPriceINR: 49999,
    monthlyDisplay: "₹4,999/mo",
    yearlyDisplay: "₹49,999/yr",
  },
};

export interface DbFeeRule {
  id: string;
  membership_plan: MembershipPlan;
  display_name: string;
  description: string;
  active: boolean;
  monthly_price: number;
  yearly_price: number;
  original_monthly_price?: number | null;
  offer_monthly_price?: number | null;
  original_yearly_price?: number | null;
  offer_yearly_price?: number | null;
  offer_enabled?: boolean | null;
  offer_label?: string | null;
  offer_badge?: string | null;
  offer_valid_until?: string | null;
  max_products: number | null;
  storage_limit_mb: number;
  admin_users_limit: number | null;
  seller_coupons_enabled: boolean;
  bulk_csv_enabled: boolean;
  ranking_boost_level: string;
  commission_rate: number;
  billing_duration: string;
  grace_period_days: number;
  min_payout_amount: number;
  escrow_hold_days: number;
  gst_rate: number;
  tcs_rate: number;
  tds_rate: number;
  platform_absorbs_coupons: boolean;
  updated_at?: string;
  updated_by?: string | null;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export interface PlanPricingBreakdown {
  plan: "PRO" | "BUSINESS";
  billingCycle: "MONTHLY" | "YEARLY";
  baseAmount: number;
  originalBaseAmount?: number | null;
  offerActive: boolean;
  offerBadge?: string | null;
  offerLabel?: string | null;
  savingsAmount?: number;
  savingsPercentage?: number;
  taxRate: number; // 0.18
  taxAmount: number;
  totalAmount: number;
}

export function getPlanPricing(
  plan: "PRO" | "BUSINESS",
  billingCycle: "MONTHLY" | "YEARLY",
  ruleOverride?: DbFeeRule | null
): PlanPricingBreakdown {
  const planInfo = MEMBERSHIP_PLANS[plan];
  
  let baseAmount: number;
  let originalBaseAmount: number | null = null;
  let offerActive = false;
  let offerBadge: string | null = null;
  let offerLabel: string | null = null;
  let taxRate = 0.18; // 18% GST default

  if (ruleOverride) {
    taxRate = Number(ruleOverride.gst_rate) || 0.18;
    const isOfferOn = Boolean(ruleOverride.offer_enabled);

    if (billingCycle === "YEARLY") {
      const regYearly = Number(ruleOverride.yearly_price);
      if (isOfferOn && ruleOverride.offer_yearly_price != null && Number(ruleOverride.offer_yearly_price) > 0) {
        baseAmount = Number(ruleOverride.offer_yearly_price);
        originalBaseAmount = ruleOverride.original_yearly_price != null && Number(ruleOverride.original_yearly_price) > 0
          ? Number(ruleOverride.original_yearly_price)
          : regYearly;
        offerActive = true;
      } else {
        baseAmount = regYearly;
      }
    } else {
      const regMonthly = Number(ruleOverride.monthly_price);
      if (isOfferOn && ruleOverride.offer_monthly_price != null && Number(ruleOverride.offer_monthly_price) > 0) {
        baseAmount = Number(ruleOverride.offer_monthly_price);
        originalBaseAmount = ruleOverride.original_monthly_price != null && Number(ruleOverride.original_monthly_price) > 0
          ? Number(ruleOverride.original_monthly_price)
          : regMonthly;
        offerActive = true;
      } else {
        baseAmount = regMonthly;
      }
    }

    if (offerActive) {
      offerBadge = ruleOverride.offer_badge || "LIMITED OFFER";
      offerLabel = ruleOverride.offer_label || "Special Offer";
    }
  } else {
    baseAmount = billingCycle === "YEARLY" ? planInfo.yearlyPriceINR : planInfo.monthlyPriceINR;
  }

  let savingsAmount: number | undefined;
  let savingsPercentage: number | undefined;
  if (offerActive && originalBaseAmount && originalBaseAmount > baseAmount) {
    savingsAmount = Math.round((originalBaseAmount - baseAmount) * 100) / 100;
    savingsPercentage = Math.round(((originalBaseAmount - baseAmount) / originalBaseAmount) * 100);
  }

  const taxAmount = Math.round(baseAmount * taxRate * 100) / 100;
  const totalAmount = Math.round((baseAmount + taxAmount) * 100) / 100;

  return {
    plan,
    billingCycle,
    baseAmount,
    originalBaseAmount,
    offerActive,
    offerBadge,
    offerLabel,
    savingsAmount,
    savingsPercentage,
    taxRate,
    taxAmount,
    totalAmount,
  };
}

export interface UsageStatus {
  currentProducts: number;
  maxProducts: number | null;
  percentage: number;
  isWarning: boolean; // At 9 products (90%)
  isLimitReached: boolean; // At 10 products (100%)
  remainingSlots: number | null;
}

export function getProductUsageStatus(
  currentProducts: number,
  plan: MembershipPlan = "BASIC",
  customMaxProducts?: number | null
): UsageStatus {
  const planInfo = MEMBERSHIP_PLANS[plan] || MEMBERSHIP_PLANS.BASIC;
  const max = customMaxProducts !== undefined ? customMaxProducts : planInfo.maxProducts;

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
