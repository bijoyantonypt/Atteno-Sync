// POST /functions/v1/register-device
// Pairs a kiosk with the backend. Called from the kiosk's admin mode with an admin session.
// Body: { name, public_key_spki }  (base64 X.509 SubjectPublicKeyInfo of an EC P-256 key)

import { db, importDeviceKey, requireAdmin } from "../_shared/auth.ts";
import { HttpError, serve } from "../_shared/http.ts";

serve(async (body, req) => {
  const adminId = await requireAdmin(req);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const publicKey = typeof body.public_key_spki === "string" ? body.public_key_spki.trim() : "";
  if (!name || !publicKey || publicKey.length > 512) throw new HttpError(400, "name and public_key_spki are required");

  await importDeviceKey(publicKey); // rejects anything that is not a valid P-256 SPKI key

  const { data, error } = await db
    .from("devices")
    .upsert({ name, public_key_spki: publicKey, status: "active", registered_by: adminId }, { onConflict: "public_key_spki" })
    .select("id")
    .single();
  if (error) throw error;
  return { device_id: data.id };
});
