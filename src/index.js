// Studio 936 — Escenario API
//
// Endpoints:
//   GET  /                -> confirma que el Worker está vivo
//   GET  /api/health      -> confirma que D1 y R2 responden de verdad
//   GET  /api/songs       -> lista canciones publicadas (tabla de prueba)
//   POST /api/songs       -> publica una canción de prueba (sin protección)
//   *    /api/auth/*      -> maneja better-auth (registro, login, sesión)
//   GET  /api/me          -> confirma tu sesión activa
//
//   Fase B — Composiciones (requieren sesión activa):
//   GET    /api/compositions      -> lista TUS composiciones
//   POST   /api/compositions      -> crea una composición nueva
//   PUT    /api/compositions/:id  -> actualiza una composición tuya
//   DELETE /api/compositions/:id  -> borra una composición tuya

import { createAuth } from "./auth.js";

function json(data, status = 200, request = null) {
  const origin = request ? request.headers.get("Origin") : null;
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
  // Fase B: composiciones reales, una por usuario.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS compositions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      genre TEXT,
      album_id TEXT,
      playlists TEXT,
      preview_audio_id TEXT,
      project TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`
  ).run();
  // Cambio 235: agregar columna status a tablas existentes que no la tengan
  // (ALTER TABLE IF NOT EXISTS no existe en SQLite, así que ignoramos el error)
  try { await env.DB.prepare("ALTER TABLE compositions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'").run(); } catch(_) {}
}

// Fase B: helper compartido — confirma que hay sesión activa, o corta con
// un 401 claro. Se usa en cada endpoint que necesita saber "de quién" son
// los datos.
async function requireSession(request, env) {
  const auth = createAuth(env, new URL(request.url).origin);
  const session = await auth.api.getSession({ headers: request.headers });
  return session; // null si no hay sesión
}

function rowToComposition(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author || "",
    genre: row.genre || "",
    albumId: row.album_id || null,
    playlists: row.playlists ? JSON.parse(row.playlists) : [],
    previewAudioId: row.preview_audio_id || null,
    project: row.project ? JSON.parse(row.project) : {},
    status: row.status || 'draft',
    updated: row.updated_at,
  };
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
      }, 200, request);
    }

    if (url.pathname === "/api/health") {
      try {
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT COUNT(*) as total FROM songs").all();
        return json({
          ok: true,
          d1: "conectado",
          cancionesEnD1: results[0].total,
          r2: env.MEDIA ? "conectado" : "no configurado",
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
      try { body = await request.json(); } catch (_) {
        return json({ error: "JSON inválido." }, 400, request);
      }
      if (!body.title) return json({ error: "Falta 'title'." }, 400, request);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO songs (id, title, author, created_at) VALUES (?, ?, ?, ?)"
      ).bind(id, body.title, body.author || "", Date.now()).run();
      return json({ ok: true, id }, 200, request);
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(env, url.origin);
      const response = await auth.handler(request);
      const origin = request.headers.get("Origin");
      if (origin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set("Vary", "Origin");
      }
      return response;
    }

    if (url.pathname === "/api/me") {
      const session = await requireSession(request, env);
      if (!session) return json({ error: "No autenticado." }, 401, request);
      return json({ user: session.user }, 200, request);
    }

    // -----------------------------------------------------------------
    // Fase B: Composiciones — todas requieren sesión activa
    // -----------------------------------------------------------------
    if (url.pathname === "/api/compositions" && request.method === "GET") {
      await ensureSchema(env);
      const session = await requireSession(request, env);
      if (!session) return json({ error: "No autenticado." }, 401, request);
      const { results } = await env.DB.prepare(
        "SELECT * FROM compositions WHERE user_id = ? ORDER BY updated_at DESC"
      ).bind(session.user.id).all();
      return json({ compositions: results.map(rowToComposition) }, 200, request);
    }

    if (url.pathname === "/api/compositions" && request.method === "POST") {
      await ensureSchema(env);
      const session = await requireSession(request, env);
      if (!session) return json({ error: "No autenticado." }, 401, request);
      let body;
      try { body = await request.json(); } catch (_) {
        return json({ error: "JSON inválido." }, 400, request);
      }
      if (!body.title) return json({ error: "Falta 'title'." }, 400, request);
      const id = body.id || crypto.randomUUID();
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO compositions
          (id, user_id, title, author, genre, album_id, playlists, preview_audio_id, project, status, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, session.user.id, body.title, body.author || "", body.genre || "",
        body.albumId || null, JSON.stringify(body.playlists || []),
        body.previewAudioId || null, JSON.stringify(body.project || {}),
        body.status || 'draft', now, now
      ).run();
      return json({ ok: true, id }, 200, request);
    }

    if (url.pathname.startsWith("/api/compositions/") && request.method === "PUT") {
      await ensureSchema(env);
      const session = await requireSession(request, env);
      if (!session) return json({ error: "No autenticado." }, 401, request);
      const id = url.pathname.split("/").pop();
      let body;
      try { body = await request.json(); } catch (_) {
        return json({ error: "JSON inválido." }, 400, request);
      }
      // Solo se actualiza si la composición es tuya (user_id coincide).
      const result = await env.DB.prepare(
        `UPDATE compositions SET
           title = ?, author = ?, genre = ?, album_id = ?, playlists = ?,
           preview_audio_id = ?, project = ?, status = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).bind(
        body.title, body.author || "", body.genre || "", body.albumId || null,
        JSON.stringify(body.playlists || []), body.previewAudioId || null,
        JSON.stringify(body.project || {}), body.status || 'draft',
        Date.now(), id, session.user.id
      ).run();
      if (result.meta.changes === 0) {
        return json({ error: "No encontrada, o no es tuya." }, 404, request);
      }
      return json({ ok: true }, 200, request);
    }

    if (url.pathname.startsWith("/api/compositions/") && request.method === "DELETE") {
      await ensureSchema(env);
      const session = await requireSession(request, env);
      if (!session) return json({ error: "No autenticado." }, 401, request);
      const id = url.pathname.split("/").pop();
      const result = await env.DB.prepare(
        "DELETE FROM compositions WHERE id = ? AND user_id = ?"
      ).bind(id, session.user.id).run();
      if (result.meta.changes === 0) {
        return json({ error: "No encontrada, o no es tuya." }, 404, request);
      }
      return json({ ok: true }, 200, request);
    }

    return json({ error: "No encontrado." }, 404, request);
  },
};
