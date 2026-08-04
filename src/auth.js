// Studio 936 — Escenario API — Autenticación (Cambio: login de usuarios real)
//
// Better Auth 1.5+ ya soporta D1 de forma NATIVA — se le pasa el binding
// directo (env.DB), sin necesitar una librería adaptadora aparte. Esto es
// más simple y más nuevo que lo que se usaba antes (better-auth-cloudflare).
//
// AVISO HONESTO — precauciones reales, documentadas por la comunidad (no
// inventadas por mí), que se mantienen aquí:
//   1. cookieCache queda DESACTIVADO a propósito — hay un bug real
//      (better-auth#4203) donde, combinado con sesiones en KV, la gente
//      queda "deslogueada" sola a los pocos minutos.
//   2. Se crea una instancia de auth NUEVA en cada petición (no una sola
//      reutilizada) — el runtime de Workers aísla cada request, y
//      reutilizar una instancia global es causa documentada de fallas
//      intermitentes en producción.
import { betterAuth } from "better-auth";

export function createAuth(env, baseURL) {
  return betterAuth({
    baseURL: baseURL || env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB, // binding D1 nativo — Better Auth 1.5+ lo detecta solo
    emailAndPassword: {
      enabled: true,
    },
    session: {
      storeSessionInDatabase: true,
      updateAge: 60 * 15,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
    },
  });
}
