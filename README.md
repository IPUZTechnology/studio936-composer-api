# Studio 936 — Escenario API

Este es el backend real de "Escenario" — separado por completo de
`Studio936-Composer` (ese sigue siendo la app estática de GitHub Pages).
Este es un proyecto aparte, para un Cloudflare Worker.

## Qué tiene ahora mismo

1. **El pipeline completo** confirmado: GitHub Actions → Wrangler →
   Cloudflare → D1 (base de datos) → R2 (archivos).
2. **Login de usuarios real** (correo + contraseña) con `better-auth`,
   conectado a la misma base D1 — usando `better-auth-cloudflare` con
   `d1Native` (sin necesitar Drizzle ORM, más simple para este proyecto).

## Pasos para arrancar (uno por uno)

### 1. Crear un repo nuevo en GitHub
Este proyecto va en un **repositorio aparte** de `Studio936-Composer` — es un
backend distinto, con su propio ciclo de vida.

Sube estos archivos ahí: `wrangler.toml`, `package.json`, `src/index.js`,
`src/auth.js`, `.github/workflows/deploy.yml`.

### 2. Instalar dependencias localmente (para poder correr los comandos de abajo)
```bash
npm install
```

### 3. Iniciar sesión en Cloudflare desde tu terminal
```bash
npx wrangler login
```

### 4. Crear la base de datos D1
```bash
npm run d1:create
```
Esto te da un `database_id` — cópialo y pégalo en `wrangler.toml`, en la línea
que dice `database_id = "REEMPLAZAR-CON-TU-DATABASE-ID"`.

### 5. Crear el bucket de R2
```bash
npm run r2:create
```
Si le pusiste otro nombre al bucket, ajusta `bucket_name` en `wrangler.toml`.

### 6. Generar y configurar el secreto de autenticación
Este es un valor aleatorio de verdad — no lo inventes ni reutilices uno de
otro proyecto:
```bash
openssl rand -hex 32
```
Copia lo que te dé, y configúralo como secreto (te va a pedir que lo pegues):
```bash
npm run secret:auth
```

### 7. Probarlo en tu máquina antes de desplegar
```bash
npm run dev
```
Abre la URL que te muestre (algo como `http://localhost:8787`) y visita
`/api/health` — debe decir que D1 y R2 están conectados.

Para probar el login localmente, puedes crear un usuario de prueba con:
```bash
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"unaClaveSegura123","name":"Val"}'
```
Y confirmar la sesión con `/api/me` (usando las cookies que te devolvió el
paso anterior).

### 8. Actualizar `BETTER_AUTH_URL` en `wrangler.toml`
Una vez sepas la URL real de tu Worker desplegado (paso 10), vuelve y
reemplaza `BETTER_AUTH_URL = "REEMPLAZAR-CON-LA-URL-DE-TU-WORKER"` con la URL
real, y vuelve a desplegar.

### 9. Configurar los secretos en GitHub (para que el deploy automático funcione)
En tu repo de GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Agrega estos dos:

- `CLOUDFLARE_API_TOKEN` — créalo en
  https://dash.cloudflare.com/profile/api-tokens con la plantilla
  **"Edit Cloudflare Workers"**.
- `CLOUDFLARE_ACCOUNT_ID` — lo ves en el dashboard de Cloudflare, en la barra
  lateral derecha de cualquier dominio tuyo.

(`BETTER_AUTH_SECRET` NO va aquí — ese ya quedó guardado directamente en
Cloudflare en el paso 6, no en GitHub.)

### 10. Subir a la rama `main`
En cuanto hagas push a `main`, el workflow de GitHub Actions corre solo y
despliega el Worker con Wrangler — no necesitas correr `wrangler deploy` a
mano nunca más.

### 11. Confirmar que quedó desplegado
Visita `https://studio936-escenario-api.<tu-subdominio>.workers.dev/api/health`
— si dice `"d1": "conectado"` y `"r2": "conectado"`, el pipeline completo
funciona de punta a punta. Prueba también crear un usuario real ahí (mismo
comando `curl` del paso 7, pero contra la URL de producción).

## Aviso honesto sobre better-auth + Cloudflare

Esta combinación es real y funciona, pero es software relativamente nuevo con
algunos problemas ya documentados por la comunidad (no inventados por mí):

- **No reutilizar una sola instancia global de `auth`** — hay que crear una
  nueva en cada petición (`createAuth(env, ...)` ya lo hace así en
  `src/index.js`). Reutilizar una sola instancia global es la causa
  documentada de fallas intermitentes en producción (peticiones colgadas,
  errores 503) porque el runtime de Workers aísla cada petición.
- **`cookieCache` desactivado a propósito** — activarlo junto con sesiones en
  KV tiene un bug conocido (issue #4203 de better-auth, seguía abierto a la
  fecha de escribir esto) donde la gente queda "deslogueada" sin motivo a los
  pocos minutos. Aquí se evita desde el diseño.

Prueba el login a fondo antes de darlo por terminado — es la parte más nueva
de todo este backend.

## Qué sigue después de esto (no incluido todavía)

1. **El modelo de datos completo de Escenario**: álbumes públicos, listas,
   estrellas/reacciones, "busco quién complemente", reportar contenido.
2. **Conectar `suite-pro-library.js`** para que hable con esta API en vez de
   (o además de) `localStorage`.
3. Certificado de creación / registro de autoría — Fase 2, más adelante.

No construir nada de esto todavía hasta confirmar que el login de arriba
funciona bien primero.
