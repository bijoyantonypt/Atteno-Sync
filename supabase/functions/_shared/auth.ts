// Authentication helpers: admin sessions (web / kiosk admin mode) and kiosk device signatures.
import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError, requireUuid } from "./http.ts";

/** Service-role client. Bypasses RLS, so every caller must authenticate first. */
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Verifies the caller's Supabase JWT, admin membership and (if enrolled) 2FA. Returns the user id. */
export async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing session token");

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired session");

  const { data: admin } = await db.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) throw new HttpError(403, "Admin access required");

  const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: data.user.id });
  const hasVerifiedFactor = (factors?.factors ?? []).some((f) => f.status === "verified");
  if (hasVerifiedFactor && jwtClaim(token, "aal") !== "aal2") {
    throw new HttpError(403, "Two-factor verification required");
  }
  return data.user.id;
}

function jwtClaim(token: string, claim: string): unknown {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload))[claim];
  } catch {
    return undefined;
  }
}

export function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Imports an SPKI (X.509 SubjectPublicKeyInfo) P-256 public key; throws 400 if malformed. */
export async function importDeviceKey(spkiB64: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "spki",
      b64ToBytes(spkiB64),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new HttpError(400, "Invalid device public key");
  }
}

/** Loads an active kiosk's public key. Throws 401 for unknown or revoked devices. */
export async function loadDeviceKey(deviceId: unknown): Promise<{ id: string; key: CryptoKey }> {
  const id = requireUuid(deviceId, "device_id");
  const { data: device } = await db.from("devices").select("public_key_spki, status").eq("id", id).maybeSingle();
  if (!device || device.status !== "active") throw new HttpError(401, "Unknown or revoked device");
  await db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  return { id, key: await importDeviceKey(device.public_key_spki) };
}

/** Verifies an ECDSA P-256 / SHA-256 signature in IEEE-P1363 (r||s, 64 bytes) format. */
export async function verifySignature(key: CryptoKey, message: string, signatureB64: unknown): Promise<boolean> {
  if (typeof signatureB64 !== "string") return false;
  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signatureB64),
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

const READ_WINDOW_MS = 2 * 60 * 1000;

/**
 * Authenticates a signed, read-only kiosk request.
 * Signed message: `${purpose}|${device_id}|${nonce}|${ts}` + extra fields joined with "|".
 */
export async function requireSignedKioskRequest(
  body: Record<string, unknown>,
  purpose: string,
  extra: string[] = [],
): Promise<string> {
  const { id, key } = await loadDeviceKey(body.device_id);
  const nonce = requireUuid(body.nonce, "nonce");
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > READ_WINDOW_MS) {
    throw new HttpError(401, "Request expired; check kiosk clock");
  }
  const message = [purpose, id, nonce, String(ts), ...extra].join("|");
  if (!(await verifySignature(key, message, body.signature))) throw new HttpError(401, "Invalid signature");
  return id;
}
