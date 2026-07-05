import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getVaultKey(): Buffer {
  const raw = process.env.CREDENTIAL_VAULT_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_VAULT_KEY is not set. Must be a 32-byte hex string.",
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_VAULT_KEY must be 32 bytes (64 hex chars), got ${key.length} bytes`,
    );
  }
  return key;
}

export function encrypt(plaintext: string, key?: Buffer): string {
  const vaultKey = key ?? getVaultKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, vaultKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function decrypt(ciphertext: string, key?: Buffer): string {
  const vaultKey = key ?? getVaultKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid ciphertext format. Expected iv:ciphertext:authTag",
    );
  }
  const [ivHex, encryptedHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex!, "hex");
  const encrypted = Buffer.from(encryptedHex!, "hex");
  const authTag = Buffer.from(authTagHex!, "hex");

  const decipher = createDecipheriv(ALGORITHM, vaultKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isVaultEnabled(): boolean {
  return !!process.env.CREDENTIAL_VAULT_KEY;
}
