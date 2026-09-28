import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Derives a deterministic 32-byte key for AES-256-GCM.
 * Never exposed to browser/client bundles.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.BANK_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "vendosmith_default_bank_vault_secret_key_32";
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
 */
export function decryptAccountNumber(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted bank account payload format.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
