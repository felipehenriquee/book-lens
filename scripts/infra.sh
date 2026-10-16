#!/usr/bin/env bash
# Sobe a infraestrutura de desenvolvimento do BookLens em Docker e espera
# cada serviço ficar pronto:
#   - MariaDB  (porta 3307): banco, fonte da verdade
#   - Redis    (porta 6379): pub/sub do SSE, tokens, rate limits, vagas por usuário
#   - RabbitMQ (porta 5672, painel em http://localhost:15672): fila do Celery
# Usa `docker run` em vez de `docker compose` porque o Docker via snap não
# consegue ler arquivos em /media.
set -euo pipefail

start() {  # start <nome> <args do docker run...>
  local name=$1; shift
  if [ -z "$(docker ps -aq -f name="^${name}$")" ]; then
    docker run -d --name "$name" "$@" >/dev/null
  else
    docker start "$name" >/dev/null
  fi
}

wait_for() {  # wait_for <descrição> <comando>
  local label=$1; shift
  echo -n "Aguardando $label"
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then echo " ok"; return 0; fi
    echo -n "."; sleep 1
  done
  echo " falhou" >&2; return 1
}

redis_ping() { exec 3<>/dev/tcp/127.0.0.1/6379 && printf 'PING\r\n' >&3 && read -r -t 2 reply <&3 && [[ "$reply" == +PONG* ]]; }
rabbit_ready() { curl -sf -u booklens:booklens http://localhost:15672/api/overview; }

start booklens-db \
  -e MARIADB_DATABASE=booklens -e MARIADB_USER=booklens -e MARIADB_PASSWORD=booklens \
  -e MARIADB_ROOT_PASSWORD=booklens_root \
  -p 3307:3306 -v booklens_mysql_data:/var/lib/mysql mariadb:11

start booklens-redis -p 6379:6379 -v booklens_redis_data:/data redis:7-alpine \
  redis-server --appendonly yes

start booklens-rabbitmq \
  -e RABBITMQ_DEFAULT_USER=booklens -e RABBITMQ_DEFAULT_PASS=booklens \
  -p 5672:5672 -p 15672:15672 -v booklens_rabbitmq_data:/var/lib/rabbitmq \
  --hostname booklens-rabbitmq rabbitmq:3.13-management

wait_for "o banco" docker exec booklens-db mariadb -ubooklens -pbooklens -e 'select 1' booklens
wait_for "o Redis" redis_ping
wait_for "o RabbitMQ" rabbit_ready
