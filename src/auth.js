// Studio 936 — Escenario API — Autenticación (Cambio: login de usuarios real)
//
// Usa "better-auth-cloudflare" con d1Native — esto evita necesitar Drizzle
// ORM (una capa extra que complica cosas en el entorno de Workers). Es el
// camino más simple documentado para D1 + better-auth en Cloudflare.
//
// AVISO HONESTO — bugs conocidos de esta librería (documentados, no
// inventados por mí) que ya se evitan en esta configuración:
//   1. Si activas `cookieCache` junto con `secondaryStorage` (KV), hay un
//      bug real donde las sesiones no se refrescan y la gente queda
//      "deslogueada" a los pocos minutos (better-auth#4203, sigue abierto
//      a la fecha). Por eso aquí cookieCache queda DESACTIVADO — se paga
//      una lectura extra a D1 por sesión, pero es correcto.
//   2. Hay que crear una instancia de auth POR PETICIÓN (no una sola
//      instancia global reutilizada) porque el runtime de Workers aísla
//      cada request — por eso createAuth() es una función, no un objeto
//      ya armado.
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

export function createAuth(env, cf, baseURL) {
  return betterAuth({
    baseURL: baseURL || env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    ...withCloudflare(
      {
        autoDetectIpAddress: true,
        geolocationTracking: true,
        cf: cf || {},
        d1Native: env.DB, // el mismo binding "DB" que ya usa el resto del Worker
      },
      {
        emailAndPassword: {
          enabled: true,
        },
        // Cambio: cookieCache DESACTIVADO a propósito — ver aviso arriba.
        session: {
          storeSessionInDatabase: true,
          updateAge: 60 * 15,
        },
        rateLimit: {
          enabled: true,
          window: 60,
          max: 100,
        },
      }
    ),
  });
}
