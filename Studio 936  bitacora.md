# Studio 936 — Escenario API (Backend)

Backend real de "Escenario" — separado por completo de `Studio936-Composer`
(ese sigue siendo la app estática de GitHub Pages). Este repo es el
Cloudflare Worker: login de usuarios, base de datos, almacenamiento de
archivos.

---

## Arquitectura

```
┌─────────────────────────────┐
│   GitHub (este repo)         │
│   studio936-escenario-api    │
└──────────────┬───────────────┘
               │ push a main
               ▼
┌─────────────────────────────┐
│   GitHub Actions             │
│   .github/workflows/deploy.yml│
│   (usa CLOUDFLARE_API_TOKEN  │
│   y CLOUDFLARE_ACCOUNT_ID)   │
└──────────────┬───────────────┘
               │ wrangler deploy
               ▼
┌─────────────────────────────────────────────┐
│   Cloudflare Worker: studio936-escenario-api │
│   https://studio936-escenario-api            │
│         .ripuz.workers.dev                   │
│                                               │
│   ┌─────────────┐      ┌──────────────┐     │
│   │  D1 (SQLite) │      │ R2 (archivos)│     │
│   │  binding: DB │      │ binding:MEDIA│     │
│   └─────────────┘      └──────────────┘     │
└───────────────────────────────────────────────┘
```

## Stack tecnológico

| Pieza | Tecnología | Para qué |
|---|---|---|
| Cómputo | Cloudflare Workers | El backend en sí, corre el código de `src/` |
| Base de datos | Cloudflare D1 (SQLite) | Usuarios, sesiones, canciones publicadas, listas |
| Almacenamiento | Cloudflare R2 | Audio/video/carátulas (sin costo de descarga) |
| Autenticación | better-auth 1.5+ | Login correo/contraseña, con soporte nativo D1 |
| Despliegue | GitHub Actions + Wrangler | Automático en cada push a `main` |
| Lenguaje | JavaScript (ES modules) | Sin TypeScript por ahora, mantenerlo simple |

## Recursos reales ya creados (Cuenta de Cloudflare: Rafael.ipuz@ripuz.co)

- **Cuenta de Cloudflare (Account ID):** `19c55805abbb6fa8c09d35cc52da0700`
- **Worker desplegado:** `studio936-escenario-api`
  → `https://studio936-escenario-api.ripuz.workers.dev`
- **Base de datos D1:** `studio936-escenario`
  → `database_id: a8702683-2da2-448b-bd6a-d8284f8f20df`
- **Bucket R2:** `studio936-escenario-media`
- **Secreto guardado en Cloudflare:** `BETTER_AUTH_SECRET` (generado con `openssl rand -hex 32`, nunca visible en texto plano)
- **Secretos guardados en GitHub** (repo → Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## Estructura de archivos

```
wrangler.toml              # Configuración de Cloudflare (D1, R2, variables)
package.json                # Dependencias (better-auth, wrangler)
src/
  ├── index.js              # El Worker: todos los endpoints
  └── auth.js                # Configuración de better-auth
.github/workflows/deploy.yml # Despliegue automático al hacer push a main
README.md                   # Este archivo — arquitectura + bitácora
```

## Endpoints actuales

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | Confirma que el Worker está vivo |
| GET | `/api/health` | Confirma que D1 y R2 responden |
| GET | `/api/songs` | Lista canciones (tabla de prueba) |
| POST | `/api/songs` | Publica una canción de prueba (sin protección aún) |
| * | `/api/auth/*` | Registro, login, sesión (maneja better-auth) |
| GET | `/api/me` | Ejemplo de endpoint protegido (requiere sesión) |
| POST | `/api/setup-auth-db` | ⚠️ Crea tablas de auth — **pendiente de borrar**, ver Pendientes |

---

## Cómo desplegar cambios (flujo normal)

```bash
# Si es una terminal nueva, primero:
export CLOUDFLARE_API_TOKEN="tu-token"

# Editar archivos, luego:
npx wrangler deploy        # para probar de una vez sin esperar el push
git add .
git commit -m "Descripción del cambio"
git push                    # dispara el despliegue automático también
```

## Lecciones aprendidas (para no repetir los mismos tropiezos)

1. **Nunca subir `node_modules/`** — agregar `.gitignore` desde el día 1 en cualquier repo con Node.
2. **`CLOUDFLARE_API_TOKEN` no se comparte entre terminales** — cada terminal/pestaña nueva de Codespaces necesita el `export` de nuevo.
3. **El login por navegador (`wrangler login`) no funciona en Codespaces** — usar siempre un token de API (`export CLOUDFLARE_API_TOKEN=...`).
4. **R2 necesita activarse una vez manualmente** en el dashboard de Cloudflare antes de poder crear buckets por comando (es gratis dentro del límite, solo pide tarjeta de respaldo).
5. **`compatibility_flags` debe ir ARRIBA** en `wrangler.toml`, junto a `name`/`main` — si queda después de una sección `[vars]`, TOML lo trata como si fuera parte de esa sección y no funciona.
6. **`env.DB.exec()` de D1 espera una instrucción SQL por LÍNEA** — si el SQL tiene saltos de línea (por formato/legibilidad), se rompe. Usar `env.DB.prepare(sql).run()` en su lugar para instrucciones normales.
7. **better-auth necesita sus propias tablas** (`user`, `session`, `account`, `verification`) — el comando normal de migración no funciona en Cloudflare Workers (la base de datos de producción solo existe dentro del propio Worker). Se resuelve con un endpoint temporal que llama a `getMigrations()` desde adentro.
8. **Arrastrar archivos al Codespace desde el navegador puede fallar en silencio** — el método confiable es crear archivos directo por terminal con `cat > archivo.js << 'EOF' ... EOF`.
9. **Los workflows de GitHub Actions se pueden perder/dañar sin darse cuenta** — siempre confirmar que `.github/workflows/deploy.yml` sigue existiendo si los despliegues dejan de dispararse solos.

---

## Pendientes activos

1. **Borrar `/api/setup-auth-db`** del código — ya cumplió su función (creó las tablas), no debe quedar en el Worker de forma permanente.
2. **Conectar `suite-pro-library.js`** (la app real) para que hable con esta API en vez de (o además de) `localStorage`. Decisión confirmada: **TODO se sincroniza desde ya, sin migración de nada anterior** (no existe ninguna cuenta previa que traer — se parte de cero).
   - **Fase A:** pantalla de login/registro dentro del 936 Player.
   - **Fase B:** sincronizar datos livianos (composiciones, títulos, listas, álbumes, radios, etiquetas) a D1.
   - **Fase C:** sincronizar archivos pesados (audio real, video, carátulas) a R2 — la parte más grande de construir (subida de archivos real, progreso, manejo de conexión lenta).
3. **El modelo de datos completo de Escenario**: álbumes públicos, listas, estrellas/reacciones, "busco quién complemente", reportar contenido.
4. Certificado de creación / registro de autoría — Fase 2, más adelante.
5. Actualizar Wrangler a la versión 4 (`npm install --save-dev wrangler@4`) — seguimos en 3.114.17, funciona pero da warning de desactualizado en cada comando.

---

## Bitácora de sesiones

### Sesión 1 — 4 de agosto de 2026

**Qué se hizo:**
- Se creó el repositorio nuevo `studio936-escenario-api`, separado de Composer.
- Se desplegó el esqueleto base del Worker (D1 + R2 + endpoints de prueba).
- Se agregó login de usuarios real con better-auth 1.5 (soporte nativo D1, sin necesitar Drizzle).
- Se resolvieron 9 problemas reales de despliegue (ver "Lecciones aprendidas" arriba) — desde `node_modules` subido por error, hasta el formato de `wrangler.toml` y las tablas de better-auth.
- **Se confirmó con una prueba real:** registro de usuario (`rafael.ipuz@ripuz.co`) funcionando de punta a punta, con cookie de sesión real devuelta por el servidor.

**Qué quedó entregado y funcionando:**
- `https://studio936-escenario-api.ripuz.workers.dev/api/health` → D1 y R2 conectados.
- `https://studio936-escenario-api.ripuz.workers.dev/api/auth/sign-up/email` → login real funcionando.

**Qué sigue (próxima sesión):**
- Borrar el endpoint temporal `/api/setup-auth-db`.
- Definir el modelo de datos real de Escenario (más allá de la tabla `songs` de prueba).
- Empezar a conectar el frontend (`suite-pro-library.js`) con esta API.
