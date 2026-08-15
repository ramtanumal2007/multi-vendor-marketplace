import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currencyCode: string = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

export function formatExactDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatRelativeTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} mo ago`;
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
}

export const INTERNAL_ORDER_STATUSES = [
  "ORDERED",
  "CONFIRMED",
  "READY TO DISPATCH",
  "SHIPPED",
  "IN TRANSIT",
  "OUT FOR DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export const CUSTOMER_TRACKING_STAGES = [
  "ORDERED",
  "SHIPPED",
  "IN TRANSIT",
  "OUT FOR DELIVERY",
  "DELIVERED",
] as const;

export function normalizeInternalStatus(rawStatus?: string | null): string {
  if (!rawStatus) return "ORDERED";
  const s = rawStatus.trim().toUpperCase().replace(/_/g, " ");

  if (s === "PENDING") return "ORDERED";
  if (s === "PROCESSING") return "CONFIRMED";
  if (s === "READY TO DISPATCH" || s === "READY_TO_DISPATCH") return "READY TO DISPATCH";
  if (s === "IN TRANSIT" || s === "IN_TRANSIT") return "IN TRANSIT";
  if (s === "OUT FOR DELIVERY" || s === "OUT_FOR_DELIVERY") return "OUT FOR DELIVERY";
  if (s === "SHIPPED") return "SHIPPED";
  if (s === "DELIVERED") return "DELIVERED";
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "ORDERED") return "ORDERED";

  return "ORDERED";
}

export function mapInternalToCustomerStage(internalStatus: string): string {
  const norm = normalizeInternalStatus(internalStatus);
  switch (norm) {
    case "ORDERED":
    case "CONFIRMED":
      return "ORDERED";
    case "READY TO DISPATCH":
    case "SHIPPED":
      return "SHIPPED";
    case "IN TRANSIT":
      return "IN TRANSIT";
    case "OUT FOR DELIVERY":
      return "OUT FOR DELIVERY";
    case "DELIVERED":
      return "DELIVERED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "ORDERED";
  }
}

export function mapInternalToFulfillmentStatus(internalStatus: string): string {
  const norm = normalizeInternalStatus(internalStatus);
  switch (norm) {
    case "ORDERED":
      return "pending";
    case "CONFIRMED":
      return "processing";
    case "READY TO DISPATCH":
    case "SHIPPED":
    case "IN TRANSIT":
    case "OUT FOR DELIVERY":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

export function formatSequentialCustomerId(index: number, existingCode?: string | null): string {
  if (existingCode && existingCode.startsWith("CUS-")) return existingCode;
  return `CUS-${String(index + 1).padStart(3, "0")}`;
}

export function formatSequentialSellerId(index: number, existingCode?: string | null): string {
  if (existingCode && (existingCode.startsWith("SEL-") || existingCode.startsWith("STORE-"))) return existingCode;
  return `SEL-${String(index + 1).padStart(6, "0")}`;
}

export function formatOrderItemId(itemCode?: string | null, orderNumber?: string | null, index: number = 0): string {
  if (itemCode && itemCode.startsWith("OI-")) return itemCode;
  const cleanOrderNum = (orderNumber || "10000").replace("ORD-", "");
  return `OI-${cleanOrderNum}-${String(index + 1).padStart(3, "0")}`;
}

export function isRawUuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export function formatDisplaySku(sku?: string | null): string | null {
  if (!sku) return null;
  if (isRawUuid(sku)) return null;
  return sku;
}

export function getDeliveryEstimateText(
  sellerProcessingDays?: number | null,
  customerPin?: string | null,
  storePin?: string | null
): { message: string; isEstimated: boolean; estimatedDateRange?: string } {
  const processing = typeof sellerProcessingDays === "number" && sellerProcessingDays > 0 ? sellerProcessingDays : null;

  if (processing !== null) {
    const minDays = processing + 1;
    const maxDays = processing + 3;

    const minDate = new Date();
    minDate.setDate(minDate.getDate() + minDays);

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + maxDays);

    const minStr = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(minDate);
    const maxStr = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(maxDate);

    return {
      message: `Estimated Delivery: ${minStr} - ${maxStr} (${minDays}-${maxDays} business days)`,
      isEstimated: true,
      estimatedDateRange: `${minDays}-${maxDays} days`,
    };
  }

  // If no configured processing/transit data exists, return neutral message without fabricating fake ETA
  return {
    message: "Standard shipping available — Final delivery date calculated at checkout",
    isEstimated: false,
  };
}

export function getGoogleMapsUrl(address?: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  landmark?: string | null;
  google_maps_url?: string | null;
}): string | null {
  if (!address) return null;
  if (address.google_maps_url && address.google_maps_url.trim().startsWith("http")) {
    return address.google_maps_url.trim();
  }

  const parts = [
    address.landmark,
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  if (!parts.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}


