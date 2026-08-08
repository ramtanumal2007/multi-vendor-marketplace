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

