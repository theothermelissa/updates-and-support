import { createHash, randomBytes } from "node:crypto";

// Magic-link and session tokens: 32 random bytes, base64url (43 characters).
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// Only this hash is stored. Plain SHA-256 is enough because tokens are random and
// high-entropy; slow hashes like bcrypt are for low-entropy secrets such as passwords.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
