#!/usr/bin/env bash
# Sobe o MariaDB do BookLens em Docker (porta 3307) e espera ficar pronto.
# Usa `docker run` em vez de `docker compose` porque o Docker via snap
# não consegue ler arquivos em /media.
set -euo pipefail

NAME=booklens-db

if [ -z "$(docker ps -aq -f name="^${NAME}$")" ]; then
  docker run -d --name "$NAME" \
    -e MARIADB_DATABASE=booklens \
    -e MARIADB_USER=booklens \
    -e MARIADB_PASSWORD=booklens \
    -e MARIADB_ROOT_PASSWORD=booklens_root \
    -p 3307:3306 \
    -v booklens_mysql_data:/var/lib/mysql \
    mariadb:11 >/dev/null
else
  docker start "$NAME" >/dev/null
fi

echo -n "Aguardando o banco ficar pronto"
for _ in $(seq 1 60); do
  if docker exec "$NAME" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1 \
    && docker exec "$NAME" mariadb -ubooklens -pbooklens -e 'select 1' booklens >/dev/null 2>&1; then
    echo " ok"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " falhou (veja: docker logs $NAME)" >&2
exit 1
