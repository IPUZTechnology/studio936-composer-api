#!/bin/bash
# Studio 936 — Escenario API — Provisionar Cloudflare (D1 + R2 + secreto)
#
# Uso: correr esto DESPUÉS de haber hecho `npx wrangler login` y de estar
# parado dentro de la carpeta del repo (donde está wrangler.toml).
#
#   chmod +x provision.sh
#   ./provision.sh

set -e

echo "======================================"
echo " Studio 936 — Escenario API"
echo " Provisionando Cloudflare (D1 + R2)"
echo "======================================"
echo ""

if [ ! -f "wrangler.toml" ]; then
  echo "❌ No encuentro wrangler.toml en esta carpeta."
  echo "   Asegúrate de correr esto DENTRO de la carpeta del repo."
  exit 1
fi

echo "== 1) Instalando dependencias (npm install) =="
npm install
echo ""

echo "== 2) Creando base de datos D1 =="
D1_OUTPUT=$(npx wrangler d1 create studio936-escenario 2>&1) || {
  echo "$D1_OUTPUT"
  echo ""
  echo "⚠  Si el error dice que la base ya existe, no hay problema —"
  echo "   corre 'npx wrangler d1 list' para ver su database_id y pégalo"
  echo "   tú mismo en wrangler.toml donde dice REEMPLAZAR-CON-TU-DATABASE-ID."
  exit 1
}
echo "$D1_OUTPUT"

DB_ID=$(echo "$D1_OUTPUT" | grep -oE 'database_id[[:space:]]*=[[:space:]]*"[a-f0-9-]+"' | grep -oE '[a-f0-9-]{30,}')

if [ -z "$DB_ID" ]; then
  echo ""
  echo "⚠  No pude detectar el database_id automáticamente en la salida de arriba."
  echo "   Cópialo a mano y pégalo en wrangler.toml donde dice"
  echo "   REEMPLAZAR-CON-TU-DATABASE-ID"
else
  echo ""
  echo "✅ database_id detectado: $DB_ID"
  sed -i.bak "s/REEMPLAZAR-CON-TU-DATABASE-ID/$DB_ID/" wrangler.toml
  rm -f wrangler.toml.bak
  echo "✅ wrangler.toml actualizado automáticamente."
fi
echo ""

echo "== 3) Creando bucket R2 =="
npx wrangler r2 bucket create studio936-escenario-media || {
  echo "⚠  Si dice que ya existe, no hay problema, seguimos."
}
echo ""

echo "== 4) Generando y guardando el secreto de autenticación =="
SECRET=$(openssl rand -hex 32)
echo "   (Este valor no se vuelve a mostrar — Cloudflare ya lo guarda cifrado)"
echo "$SECRET" | npx wrangler secret put BETTER_AUTH_SECRET
echo ""

echo "======================================"
echo " ✅ Listo. Próximos pasos manuales:"
echo "======================================"
echo "1) Revisa wrangler.toml — confirma que database_id quedó bien puesto."
echo "2) Sube estos cambios a git (git add, commit, push a main) para que"
echo "   el GitHub Action despliegue el Worker de verdad."
echo "3) Una vez desplegado, copia la URL real de tu Worker y reemplázala"
echo "   en wrangler.toml donde dice BETTER_AUTH_URL, y vuelve a hacer push."
echo "4) Prueba con:"
echo "   curl -X POST https://TU-WORKER.workers.dev/api/auth/sign-up/email \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"email\":\"tu@correo.com\",\"password\":\"unaClaveSegura123\",\"name\":\"Val\"}'"
