// HTTP plumbing shared by all Atteno_Sync Edge Functions.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Wraps a POST handler with CORS, JSON parsing and uniform error responses. */
export function serve(handler: (body: Record<string, unknown>, req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const body = await req.json().catch(() => {
        throw new HttpError(400, "Body must be JSON");
      });
      if (typeof body !== "object" || body === null) throw new HttpError(400, "Body must be an object");
      return json(await handler(body, req), 200);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Internal error" }, 500);
    }
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export function requireUuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new HttpError(400, `${field} must be a UUID`);
  return v;
}


