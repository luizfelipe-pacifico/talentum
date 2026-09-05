import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  APP_ENV: string;
  ALLOWED_ORIGIN: string;
  SESSION_SIGNING_SECRET: string;
  TOKEN_HASH_PEPPER: string;
  BFF_SHARED_SECRET: string;
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const database = await env.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>();

      return json({
        status: database?.healthy === 1 ? "ok" : "degraded",
        service: "talentum-cloud-api",
        environment: env.APP_ENV,
      });
    }

    return json({ error: "not_found" }, 404);
  },
};
