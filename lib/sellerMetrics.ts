export interface StoreChecklistItem {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  points: number;
  actionUrl: string;
}

export interface SellerMetricsResult {
  score: number; // 0 to 100
  level: "New Seller" | "Verified Seller" | "Trusted Seller" | "Top Rated Seller" | "Premium Seller";
  completionPercentage: number;
  checklist: StoreChecklistItem[];
}

export function computeSellerMetrics(sellerProfile: Record<string, unknown> | null, store: Record<string, unknown> | null, productCount: number): SellerMetricsResult {
  const isApproved = sellerProfile?.verification_status === "approved";
  const hasDescription = Boolean(store?.description && (store.description as string).trim().length > 10);
  const hasPhone = Boolean(store?.phone || sellerProfile?.phone);
  const hasEmail = Boolean(store?.email || sellerProfile?.business_email);
  const hasAddress = Boolean(store?.address_line1 || store?.city);
  const hasGst = Boolean(store?.tax_gst_number);
  const hasBank = Boolean(store?.bank_account_details);
  const hasBranding = Boolean(store?.tagline || store?.logo_url || store?.banner_url);
  const hasProducts = productCount > 0;

  const checklist: StoreChecklistItem[] = [
    {
      id: "approval",
      title: "Account Verification & Approval",
      description: "Get verified and approved by marketplace administrators",
      isCompleted: isApproved,
      points: 20,
      actionUrl: "/seller/tracking",
    },
    {
      id: "gst",
      title: "Tax / GST Identification",
      description: "Provide verified business Tax or GST identification number",
      isCompleted: hasGst,
      points: 15,
      actionUrl: "/seller/store",
    },
    {
      id: "bank",
      title: "Payout Bank Account Details",
      description: "Setup bank account info for receiving direct payout transfers",
      isCompleted: hasBank,
      points: 15,
      actionUrl: "/seller/store",
    },
    {
      id: "address",
      title: "Physical Store Address",
      description: "Add physical store location and dispatch postal address",
      isCompleted: hasAddress,
      points: 15,
      actionUrl: "/seller/store",
    },
    {
      id: "contact_info",
      title: "Business Contact Info",
      description: "Provide verified phone number and support email address",
      isCompleted: hasPhone && hasEmail,
      points: 10,
      actionUrl: "/seller/store",
    },
    {
      id: "branding",
      title: "Store Branding & SEO",
      description: "Set tagline, custom theme colors, logo, and meta SEO fields",
      isCompleted: hasBranding && hasDescription,
      points: 10,
      actionUrl: "/seller/store",
    },
    {
      id: "catalog",
      title: "List First Product Catalog Item",
      description: "Publish your first product to start accepting customer orders",
      isCompleted: hasProducts,
      points: 15,
      actionUrl: "/seller/products/new",
    },
  ];

  const totalPoints = checklist.reduce((sum, item) => sum + (item.isCompleted ? item.points : 0), 0);
  const completionPercentage = Math.min(100, Math.round(totalPoints));
  const score = Math.max((sellerProfile?.seller_score as number) || 50, completionPercentage);

  let level: "New Seller" | "Verified Seller" | "Trusted Seller" | "Top Rated Seller" | "Premium Seller" = "New Seller";
  if (sellerProfile?.seller_level) {
    level = sellerProfile.seller_level as "New Seller" | "Verified Seller" | "Trusted Seller" | "Top Rated Seller" | "Premium Seller";
  } else if (isApproved && score >= 90) {
    level = "Top Rated Seller";
  } else if (isApproved && score >= 75) {
    level = "Trusted Seller";
  } else if (isApproved) {
    level = "Verified Seller";
  }

  return {
    score,
    level,
    completionPercentage,
    checklist,
  };
}
