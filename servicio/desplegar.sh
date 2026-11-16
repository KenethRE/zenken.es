#!/bin/bash
# Despliega (o actualiza) el servicio de importación de horarios en el servidor de zenken.es.
# Uso, desde la raíz del repositorio:  servicio/desplegar.sh
#
# - Copia el código a /opt/zenken-horario y construye la imagen Docker.
# - Arranca el contenedor «zenken-horario», solo accesible desde el propio servidor (127.0.0.1:8090).
# - Los horarios se guardan en /var/lib/zenken-horario (fuera del contenedor).
# - nginx de zenken.es reenvía /horario/api/ a ese puerto (ver servicio/nginx-horario.conf).
set -euo pipefail

SERVIDOR="${SERVIDOR:-root@194.164.173.60}"
CLAVE="${CLAVE:-$HOME/.ssh/IONOS}"
SSH=(ssh -i "$CLAVE" -o IdentitiesOnly=yes "$SERVIDOR")
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "→ copiando el código"
"${SSH[@]}" "mkdir -p /opt/zenken-horario /var/lib/zenken-horario && chown 10001:10001 /var/lib/zenken-horario && chmod 700 /var/lib/zenken-horario"
tar -C "$DIR" -czf - Dockerfile requirements.txt app.py extractor.py | "${SSH[@]}" "tar -C /opt/zenken-horario -xzf -"

echo "→ construyendo la imagen"
"${SSH[@]}" "docker build -q -t zenken-horario /opt/zenken-horario"

echo "→ arrancando el contenedor"
"${SSH[@]}" "docker rm -f zenken-horario >/dev/null 2>&1 || true; \
  docker run -d --name zenken-horario --restart unless-stopped \
    -p 127.0.0.1:8090:8090 \
    -v /var/lib/zenken-horario:/datos \
    --memory 900m --cpus 1.5 --shm-size 256m \
    --log-opt max-size=5m --log-opt max-file=3 \
    zenken-horario"

echo "→ comprobando"
sleep 3
"${SSH[@]}" "curl -s -o /dev/null -w 'API: HTTP %{http_code}\n' http://127.0.0.1:8090/horario/api/h/comprobacion000000"
echo "✓ servicio desplegado"
