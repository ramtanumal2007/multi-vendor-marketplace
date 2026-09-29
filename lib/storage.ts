/**
 * VENDOSMITH STORAGE ARCHITECTURE
 * Centralized Storage Definitions, Bucket Matrix, Validation, and Secure Helpers.
 */

export type PublicBucket =
  | "brand-assets"
  | "promotional-banners"
  | "seller-store-branding"
  | "category-images"
  | "product-images";

export type PrivateBucket =
  | "support-attachments"
  | "seller-kyc-docs"
  | "order-invoices"
  | "return-evidence"
  | "seller-payment-docs";

export type StorageBucket = PublicBucket | PrivateBucket;

export interface BucketMetadata {
  id: StorageBucket;
  name: string;
  isPublic: boolean;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  description: string;
}

export const STORAGE_BUCKET_CONFIG: Record<StorageBucket, BucketMetadata> = {
  "brand-assets": {
    id: "brand-assets",
    name: "Brand Assets",
    isPublic: true,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "image/gif",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ],
    description: "Marketplace brand logos, headers, favicons, corporate visual assets.",
  },
  "promotional-banners": {
    id: "promotional-banners",
    name: "Promotional Banners",
    isPublic: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    description: "Homepage hero carousel slides, festive sales banners, spotlight cards.",
  },
  "seller-store-branding": {
    id: "seller-store-branding",
    name: "Seller Store Branding",
    isPublic: true,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    description: "Seller storefront logos, store banner headers, merchant avatars.",
  },
  "category-images": {
    id: "category-images",
    name: "Category Images",
    isPublic: true,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    description: "Marketplace category icons, promotional taxonomy banners.",
  },
  "support-attachments": {
    id: "support-attachments",
    name: "Support Attachments",
    isPublic: false,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    description: "Customer complaint screenshots, delivery proofs, dispute attachments.",
  },
  "seller-kyc-docs": {
    id: "seller-kyc-docs",
    name: "Seller KYC Documents",
    isPublic: false,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    description: "Seller PAN, GST certificate, business licenses, bank verification.",
  },
  "order-invoices": {
    id: "order-invoices",
    name: "Order Invoices",
    isPublic: false,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    description: "Order tax invoices, customer receipts, seller subscription invoices.",
  },
  "return-evidence": {
    id: "return-evidence",
    name: "Return Evidence",
    isPublic: false,
    maxSizeBytes: 20 * 1024 * 1024, // 20MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "video/quicktime",
    ],
    description: "Customer return evidence, unboxing video clips, damaged goods proof.",
  },
  // Untouched existing buckets
  "product-images": {
    id: "product-images",
    name: "Product Images",
    isPublic: true,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    description: "Marketplace product catalog gallery photos.",
  },
  "seller-payment-docs": {
    id: "seller-payment-docs",
    name: "Seller Payment Docs",
    isPublic: false,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    description: "Seller UPI QR codes, bank passbook scans.",
  },
};

export const PUBLIC_BUCKETS = new Set<StorageBucket>([
  "brand-assets",
  "promotional-banners",
  "seller-store-branding",
  "category-images",
  "product-images",
]);

export const PRIVATE_BUCKETS = new Set<StorageBucket>([
  "support-attachments",
  "seller-kyc-docs",
  "order-invoices",
  "return-evidence",
  "seller-payment-docs",
]);

/**
 * Checks whether a given string is a legacy external URL (e.g. Unsplash, external CDN).
 */
export function isLegacyExternalUrl(urlOrPath: string | null | undefined): boolean {
  if (!urlOrPath) return false;
  return urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://");
}

/**
 * Validates a file against a bucket's MIME type and size constraints.
 */
export function validateStorageFile(
  file: { name: string; size: number; type: string },
  bucket: StorageBucket
): { valid: boolean; error?: string } {
  const config = STORAGE_BUCKET_CONFIG[bucket];
  if (!config) {
    return { valid: false, error: `Invalid storage bucket: "${bucket}"` };
  }

  // 1. File size check
  if (file.size > config.maxSizeBytes) {
    const maxMb = Math.round(config.maxSizeBytes / (1024 * 1024));
    const actualMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${actualMb} MB) exceeds maximum permitted size of ${maxMb} MB for ${config.name}.`,
    };
  }

  // 2. MIME type check
  const normalizedType = file.type?.toLowerCase();
  if (!normalizedType || !config.allowedMimeTypes.includes(normalizedType)) {
    const allowed = config.allowedMimeTypes.map((t) => t.replace("image/", "").replace("application/", "")).join(", ");
    return {
      valid: false,
      error: `File type "${file.type || "unknown"}" is not permitted. Allowed formats: ${allowed}.`,
    };
  }

  return { valid: true };
}

/**
 * Sanitizes and generates a cryptographically random, path-safe UUID filename.
 */
export function generateSafeFileName(originalName: string, prefix = ""): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() || "" : "";
  const cleanExt = ext.replace(/[^a-z0-9]/g, "");
  const randomSuffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const cleanPrefix = prefix ? `${prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}_` : "";
  return cleanExt ? `${cleanPrefix}${randomSuffix}.${cleanExt}` : `${cleanPrefix}${randomSuffix}`;
}

/**
 * Builds public URL for public bucket assets, with backward-compatibility for external URLs.
 */
export function getPublicStorageUrl(bucket: PublicBucket, pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (isLegacyExternalUrl(pathOrUrl)) return pathOrUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return pathOrUrl;

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/**
 * Client-side helper to request a short-lived (300-second) signed URL for private assets.
 * If the input is already an external URL, returns it immediately without an API roundtrip.
 */
export async function getSignedStorageUrl(
  bucket: PrivateBucket,
  pathOrUrl: string
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (isLegacyExternalUrl(pathOrUrl)) return pathOrUrl;

  try {
    const params = new URLSearchParams({ bucket, path: pathOrUrl });
    const res = await fetch(`/api/storage/signed-url?${params.toString()}`);
    if (!res.ok) {
      console.warn(`Failed to generate signed URL for ${bucket}/${pathOrUrl}`);
      return null;
    }
    const data = await res.json();
    return data.signedUrl || null;
  } catch (err) {
    console.error("Error fetching signed storage URL:", err);
    return null;
  }
}
