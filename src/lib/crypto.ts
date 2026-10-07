import crypto from "crypto";

/**
 * Password hashing (scrypt) and field-level encryption (AES-256-GCM)
 * for sensitive employee data (passport / ID numbers).
 * The encryption key never leaves the server.
 */

const SECRET =
  process.env.ASM_SECRET_KEY ||
  "asm-manpower-dev-secret-key-change-in-production-2026";

const ENCRYPTION_KEY = crypto.createHash("sha256").update(SECRET).digest();

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// AES-256-GCM field encryption
// ---------------------------------------------------------------------------

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      ENCRYPTION_KEY,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Mask a decrypted value for list views: ••••1234 */
export function maskValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `••••••${value.slice(-4)}`;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
