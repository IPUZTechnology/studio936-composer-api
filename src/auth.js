// Studio 936 — Escenario API — Autenticación (login de usuarios real)
//
// Better Auth 1.5+ ya soporta D1 de forma NATIVA — se le pasa el binding
// directo (env.DB), sin necesitar una librería adaptadora aparte.
//
// Fase A: la app real (Studio936-Composer) vive en GitHub Pages — un
// dominio DISTINTO al del Worker (studio936-escenario-api.ripuz.workers.dev).
// Esto es autenticación "cross-site" de verdad, y necesita tres ajustes
// específicos, documentados por better-auth, sin los cuales la cookie de
// sesión NUNCA llega al navegador aunque el login "funcione" en el
// servidor:
//   1. trustedOrigins — sin esto, better-auth rechaza la petición por
//      seguridad (protección CSRF), aunque el CORS esté bien puesto.
//   2. sameSite:'none' + secure:true — por defecto las cookies usan
//      SameSite=Lax, que el navegador NO envía en peticiones entre
//      dominios distintos. Sin este ajuste, la sesión "se crea" en el
//      servidor pero el navegador nunca la guarda.
//   3. partitioned:true (CHIPS) — Cambio 249. Con el bloqueo de cookies
//      de terceros activo por defecto en navegadores modernos (Chrome,
//      Safari), una cookie SameSite=None normal se descarta igual aunque
//      tenga Secure, porque el navegador la trata como cookie de
//      rastreo entre sitios. CHIPS ("Cookies Having Independent
//      Partitioned State") es el mecanismo que reemplaza esa política:
//      la cookie se guarda en un compartimento aislado, ligado al sitio
//      de nivel superior (github.io), y SÍ se envía en cada petición
//      hecha desde ese mismo sitio hacia el Worker. Confirmado con el
//      toast de diagnóstico (s936CloudToast, Cambio 248): la sesión se
//      creaba en el servidor pero nunca llegaba al navegador — este es
//      el eslabón que faltaba.
//
// AVISO HONESTO — otras precauciones reales, documentadas por la
// comunidad (no inventadas por mí):
//   - cookieCache queda DESACTIVADO a propósito — hay un bug real
//     (better-auth#4203) donde, combinado con sesiones en KV, la gente
//     queda "deslogueada" sola a los pocos minutos.
//   - Se crea una instancia de auth NUEVA en cada petición (no una sola
//     reutilizada) — el runtime de Workers aísla cada request, y
//     reutilizar una instancia global es causa documentada de fallas
//     intermitentes en producción.
import { betterAuth } from "better-auth";

// REEMPLAZAR si tu app vive en otro dominio (ej. un dominio propio en vez
// de github.io) — debe ser el origen EXACTO (protocolo + dominio, sin ruta).
const TRUSTED_ORIGINS = ["https://ipuztechnology.github.io"];

export function createAuth(env, baseURL) {
  return betterAuth({
    baseURL: baseURL || env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB, // binding D1 nativo — Better Auth 1.5+ lo detecta solo
    trustedOrigins: TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      storeSessionInDatabase: true,
      updateAge: 60 * 15,
    },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        partitioned: true, // Cambio 249 — CHIPS, ver nota arriba
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
    },
  });
}
