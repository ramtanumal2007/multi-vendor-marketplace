export interface OptimizationResult {
  file: File;
  blob: Blob;
  previewUrl: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
  savingsPercentage: number;
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_COUNT = 5;
export const VALIDATION_HELPER_TEXT = "Up to 5 images • JPG, PNG or WEBP • Max 5 MB each";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function validateProductImage(file: File): void {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  
  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase()) && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`File '${file.name}' is an unsupported format. Please upload JPG, PNG, or WEBP images.`);
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`File '${file.name}' (${sizeInMB} MB) exceeds the 5 MB maximum file size limit.`);
  }
}

export async function optimizeProductImage(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<OptimizationResult> {
  validateProductImage(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file '${file.name}'.`));

    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Failed to decode image '${file.name}'.`));

      img.onload = () => {
        try {
          let { width, height } = img;
          const longestSide = Math.max(width, height);

          // Downscale if longest side > maxDimension (1600px). Never upscale.
          if (longestSide > maxDimension) {
            if (width >= height) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            } else {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d", { alpha: true });
          if (!ctx) {
            reject(new Error("Unable to create 2D canvas context for image optimization."));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error(`Failed to compress image '${file.name}' into WebP.`));
                return;
              }

              const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
              const optimizedFileName = `${baseName.replace(/[^a-zA-Z0-9_-]/g, "_")}_opt.webp`;

              const optimizedFile = new File([blob], optimizedFileName, {
                type: "image/webp",
                lastModified: Date.now(),
              });

              const previewUrl = URL.createObjectURL(blob);
              const originalSize = file.size;
              const optimizedSize = blob.size;
              const savingsPercentage = originalSize > 0
                ? Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100))
                : 0;

              resolve({
                file: optimizedFile,
                blob,
                previewUrl,
                originalSize,
                optimizedSize,
                width,
                height,
                savingsPercentage,
              });
            },
            "image/webp",
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function extractStoragePath(imageUrl: string, bucketName: string = "product-images"): string | null {
  if (!imageUrl) return null;
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx !== -1) {
    return imageUrl.substring(idx + marker.length);
  }
  return null;
}

