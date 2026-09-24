// POST /functions/v1/enroll-employee
// Records (or clears) an employee's fingerprint enrolment after the kiosk has stored the
// encrypted template locally. Only the SHA-256 of the template is sent and stored.
// Body: { employee_id, fingerprint_hash: "<64 hex>" | null }

import { db, requireAdmin } from "../_shared/auth.ts";
import { HttpError, requireUuid, serve } from "../_shared/http.ts";

serve(async (body, req) => {
  await requireAdmin(req);
  const employeeId = requireUuid(body.employee_id, "employee_id");
  const hash = body.fingerprint_hash;
  if (hash !== null && (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))) {
    throw new HttpError(400, "fingerprint_hash must be 64 lowercase hex characters or null");
  }

  const { data, error } = await db
    .from("employees")
    .update({ fingerprint_hash: hash, fingerprint_enrolled_at: hash ? new Date().toISOString() : null })
    .eq("id", employeeId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Employee not found");
  return { ok: true };
});
