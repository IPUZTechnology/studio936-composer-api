// Studio 936 — Escenario API
//
// Endpoints:
//   GET  /                -> confirma que el Worker está vivo
//   GET  /api/health      -> confirma que D1 y R2 responden de verdad
//   GET  /api/songs       -> lista canciones publicadas (tabla de prueba)
//   POST /api/songs       -> publica una canción de prueba (SIN protección
//                            todavía — es solo para probar el pipeline)
//   *    /api/auth/*      -> maneja better-auth (registro, login, sesión)
//   GET  /api/me          -> ejemplo de endpoint PROTEGIDO — requiere sesión

import { createAuth } from "./auth.js";

// Fase A: la app real vive en GitHub Pages (otro dominio distinto al del
// Worker) y usa cookies de sesión (credentials:'include') — el navegador
// EXIGE que, cuando se usan credenciales, el origen permitido sea exacto
// (nunca "*"), o rechaza la respuesta en silencio. Por eso se refleja el
// origen real de cada petición en vez de un valor fijo.
function json(data, status = 200, request = null) {
  const origin = request ? request.headers.get("Origin") : null;
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    },
  });
}

async function ensureSchema(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, created_at INTEGER NOT NULL)"
  ).run();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200, request);
    }

    if (url.pathname === "/") {
      return json({
        service: "Studio 936 — Escenario API",
        status: "vivo",
        note: "Login de usuarios (better-auth) conectado en /api/auth/*.",
      }, 200, request);
    }

    if (url.pathname === "/api/health") {
      try {
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT COUNT(*) as total FROM songs").all();
        const bucketOk = !!env.MEDIA;
        return json({
          ok: true,
          d1: "conectado",
          cancionesEnD1: results[0].total,
          r2: bucketOk ? "conectado" : "no configurado",
        }, 200, request);
      } catch (err) {
        return json({ ok: false, error: String(err) }, 500, request);
      }
    }

    if (url.pathname === "/api/songs" && request.method === "GET") {
      await ensureSchema(env);
      const { results } = await env.DB.prepare(
        "SELECT id, title, author, created_at FROM songs ORDER BY created_at DESC LIMIT 50"
      ).all();
      return json({ songs: results }, 200, request);
    }

    if (url.pathname === "/api/songs" && request.method === "POST") {
      await ensureSchema(env);
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "JSON inválido en el cuerpo de la petición." }, 400, request);
      }
      if (!body.title) {
        return json({ error: "Falta 'title'." }, 400, request);
      }
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO songs (id, title, author, created_at) VALUES (?, ?, ?, ?)"
      ).bind(id, body.title, body.author || "", Date.now()).run();
      return json({ ok: true, id }, 200, request);
    }

    // Cambio: login real de usuarios. Se crea una instancia de auth NUEVA
    // en cada petición (no una sola reutilizada) — ver aviso en auth.js.
    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(env, url.origin);
      const response = await auth.handler(request);
      // Fase A: better-auth ya arma sus propios headers de CORS/cookies
      // internamente, pero hay que reforzar Allow-Origin con el origen
      // real (no "*") para que las cookies crucen bien desde GitHub Pages.
      const origin = request.headers.get("Origin");
      if (origin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set("Vary", "Origin");
      }
      return response;
    }

    if (url.pathname === "/api/me") {
      const auth = createAuth(env, url.origin);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: "No autenticado." }, 401, request);
      return json({ user: session.user }, 200, request);
    }

    return json({ error: "No encontrado." }, 404, request);
  },
};
