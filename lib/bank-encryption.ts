import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Derives a deterministic 32-byte key for AES-256-GCM.
 * Never exposed to browser/client bundles.
 * Fails closed if BANK_ENCRYPTION_KEY is missing or invalid.
 */
function getEncryptionKey(): Buffer {
  const secret = (process.env.BANK_ENCRYPTION_KEY || "").trim();
  if (!secret) {
    throw new Error("Bank encryption configuration error: BANK_ENCRYPTION_KEY is not configured.");
  }
  if (secret.length < 32) {
    throw new Error("Bank encryption configuration error: BANK_ENCRYPTION_KEY must be at least 32 characters long.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext bank account number using AES-256-GCM.
 * Output format: `ivHex:authTagHex:encryptedCiphertextHex`
 * Tamper-proof authenticated encryption.
 */
export function encryptAccountNumber(accountNumber: string): string {
  const cleanAccount = accountNumber.replace(/[^0-9]/g, "");
  if (cleanAccount.length < 9 || cleanAccount.length > 18) {
    throw new Error("Invalid account number length for encryption.");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(cleanAccount, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM bank account payload.
 * Verifies authenticity tag to prevent tampering.
 * Accessible strictly in privileged server-side routines (e.g. payout disbursals).
 *
 * Fail-Closed Policy:
 * 1. Requires an explicitly configured, valid BANK_ENCRYPTION_KEY.
 * 2. Primary decryption attempts the configured BANK_ENCRYPTION_KEY.
 * 3. Supports controlled rotation via BANK_ENCRYPTION_KEY_FALLBACK if explicitly configured by ops.
 * 4. Never silently falls back to default passphrases or unauthenticated keys.
 */
export function decryptAccountNumber(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted bank account payload format.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  // Fail closed if primary key is not configured or invalid (< 32 chars)
  const primaryKey = getEncryptionKey();

  // Attempt decryption with primary key first
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, primaryKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (primaryErr) {
    // If an explicit fallback key is configured for controlled key rotation during migration
    const fallbackSecret = (process.env.BANK_ENCRYPTION_KEY_FALLBACK || "").trim();
    if (fallbackSecret && fallbackSecret.length >= 32) {
      try {
        const fallbackKey = crypto.createHash("sha256").update(fallbackSecret).digest();
        const decipher = crypto.createDecipheriv(ALGORITHM, fallbackKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch {}
    }

    // Fail closed without exposing ciphertext or secrets
    throw new Error("Failed to decrypt bank account payload: authentication tag mismatch or invalid key.");
  }
}

