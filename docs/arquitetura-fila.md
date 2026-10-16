# Fila de scans — arquitetura

O usuário envia fotos da estante; cada foto é analisada por IA (Google Gemini) para
identificar os livros e enriquecida com dados do Google Books. Uma análise leva de 5 a
90 segundos e depende de uma API externa com cota limitada — por isso roda em
background, numa fila, e o usuário é avisado em tempo real quando cada foto fica pronta.

## Visão geral

```
                ┌──────────────┐  1. cria o job (QUEUED)    ┌──────────┐
 Front ──POST──►│     API      │───────────────────────────►│ MariaDB  │ ◄─ fonte da verdade
                │  (FastAPI)   │  2. publica a tarefa        └──────────┘
                │              │──────────┐                       ▲
 Front ◄──SSE───│              │◄──┐      ▼                       │ 4. salva o resultado
                └──────────────┘   │  ┌──────────┐ 3. entrega ┌───┴──────────────────┐
                                   │  │ RabbitMQ │───────────►│  Celery workers (N)  │──► Gemini
                                   │  └──────────┘            │                      │
                                   │  ┌──────────┐            │                      │
                                   └──│  Redis   │◄───────────│ 5. publica o evento  │
                                      └──────────┘            └──────────────────────┘
```

| Componente | Papel |
|---|---|
| **MariaDB** | Fonte da verdade: estado de cada scan (`QUEUED → PROCESSING → DONE/FAILED`), resultado e metadados. A tela "Meus scans" lê daqui. |
| **RabbitMQ** | Broker do Celery: só *entrega* "processe o job X" aos workers. Fila durável. |
| **Celery workers** | Processos que executam a análise. Escalam horizontalmente. |
| **Celery beat** | Agendador: reconciliador (a cada minuto) e limpeza de scans expirados (a cada hora). |
| **Redis** | Estado compartilhado entre processos: pub/sub das notificações, tokens do SSE, rate limits, vagas por usuário. |
| **Storage** | Fotos da fila (hoje disco local; interface pronta para S3). |

Código: [`app/worker/`](../backend/app/worker) (adaptadores do Celery),
[`app/services/scan_processor.py`](../backend/app/services/scan_processor.py) (regra de negócio),
[`app/infrastructure/redis/`](../backend/app/infrastructure/redis) e
[`app/infrastructure/notifications/redis_broker.py`](../backend/app/infrastructure/notifications/redis_broker.py).

## Decisões

**O banco é a fonte da verdade; a fila só entrega trabalho.** O status de cada scan
nunca depende do broker. Se o RabbitMQ perder uma mensagem, o job continua no banco e é
recuperado; se uma mensagem chegar duas vezes, o banco impede o processamento duplicado.

**Regra de negócio isolada do Celery.** As tarefas do Celery
([`tasks.py`](../backend/app/worker/tasks.py)) são adaptadores finos: chamam o
`ScanProcessor` e traduzem o resultado (`DONE`, `FAILED`, `SKIPPED`, `RETRY_LATER`) em
comportamento de fila. O processor depende só de interfaces de domínio — trocar Celery
por outra fila, ou o disco por S3, não muda a regra.

**Celery com asyncio.** O Celery é síncrono e o resto do backend é assíncrono. Cada
processo worker mantém **um** event loop para todas as suas tarefas (um `asyncio.run()`
por tarefa quebraria os pools de conexão do SQLAlchemy e do Redis, que ficam presos ao
loop em que nasceram), e as conexões herdadas do processo pai são descartadas logo após
o fork.

## Problemas previstos e como são tratados

Cada linha foi testada (ver "Como foi validado").

| Problema | Tratamento |
|---|---|
| **Um usuário com muitas fotos trava os outros.** | Limite de fotos simultâneas por usuário (`SCAN_MAX_CONCURRENT_PER_USER`, contador atômico no Redis). Sem vaga, a tarefa volta para o fim da fila e os outros usuários passam na frente. |
| **N workers estouram juntos o limite por minuto da Gemini.** | Rate limit global por modelo no Redis (`GEMINI_MAX_REQUESTS_PER_MINUTE`), compartilhado por todos os workers. Sem vaga, o job volta para a fila e tenta de novo depois. |
| **Modelo sem cota (HTTP 429).** | O modelo é "pausado" para todos os workers pelo tempo que a Google informa no erro (`retryDelay`); as próximas fotos vão direto para o modelo alternativo. Se todos ficarem sem cota por mais de 15 min (ex.: cota diária), o scan falha com mensagem clara em vez de esperar horas. |
| **Worker morre no meio de uma análise** (OOM, deploy, máquina caindo). | `acks_late` + `task_reject_on_worker_lost`: o RabbitMQ só considera a tarefa entregue no fim, e a entrega de novo a outro worker, que a reconhece como reentrega e retoma o job. |
| **A mesma tarefa entregue duas vezes.** | Idempotência: o worker só processa se conseguir reservar o job com um `UPDATE ... WHERE status='QUEUED'` atômico. As cópias extras terminam como `SKIPPED` sem chamar a Gemini. |
| **RabbitMQ fora do ar no momento do upload.** | Padrão *outbox*: o job é salvo no banco antes da publicação, e `enqueued_at` só é preenchido se o RabbitMQ confirmar o recebimento (*publisher confirms*). O upload responde normalmente; o reconciliador republica o que ficou sem publicar. |
| **Reconciliador gerando duplicatas sob carga.** | Ele só republica jobs **nunca publicados**, jobs **presos em processamento** além do tempo máximo da tarefa, e — como rede de segurança — jobs parados na fila por 30 min. Esperar na fila sob carga é normal e não gera republicação. |
| **Várias instâncias da API.** | Nenhum estado em memória: notificações, tokens do SSE e rate limit da API ficam no Redis. Um evento publicado por qualquer worker chega à conexão SSE em qualquer instância. |
| **Gemini lenta ou instável (503, timeout).** | Timeout de 45s por chamada e fallback automático para o modelo alternativo. |
| **Fotos e resultados acumulando.** | Foto original apagada após o sucesso; miniatura e resultado expiram em 7 dias (Celery beat). |

## Como foi validado

Testes executados contra a stack real (MariaDB, Redis e RabbitMQ em Docker), com a
Gemini simulada para não gastar cota:

| Cenário | Resultado |
|---|---|
| Usuário A envia 6 fotos; usuário B envia 1 logo depois (4 workers, limite de 2 por usuário). | B começou 0,7 s depois de A, sem esperar as 6 fotos. |
| Limite de 2 chamadas/min por modelo. | 4 chamadas passaram (2 por modelo); a 5ª devolveu o job à fila com espera de 60 s. |
| Gemini responde 429 com `retryDelay: 120s`. | Modelo pausado por 120 s para todos; a chamada seguinte nem tentou esse modelo. |
| `SIGKILL` no processo que executava uma análise. | O RabbitMQ entregou a tarefa a outro processo 0,2 s depois; job concluído. |
| A mesma tarefa publicada 3 vezes. | 1 processamento; 2 entregas descartadas em ~2 ms. |
| RabbitMQ desligado durante o upload. | Upload respondeu 202 em 0,5 s; ao religar, o reconciliador republicou e o job foi concluído. |
| Evento do worker até o navegador. | Worker → Redis → conexão SSE na API: `PROCESSING` e `DONE` recebidos. |

## Limites conhecidos e próximos passos

- **Storage local.** Workers em *outras máquinas* não enxergam as fotos do disco da API:
  é preciso um storage compartilhado (implementar `StorageInterface` para S3/GCS).
- **Retentativas com atraso no Celery + RabbitMQ.** Tarefas reagendadas (`countdown`)
  ficam na memória do worker até a hora de rodar. Com muito volume reagendado, o ideal é
  uma fila de atraso no próprio RabbitMQ (TTL + dead-letter exchange).
- **Mensagem "venenosa".** Uma foto que derrube o processo toda vez seria reentregue
  indefinidamente (`acks_late`). Mitigação: filas *quorum* do RabbitMQ, que contam
  entregas e permitem mandar para uma fila de mortos após N tentativas.
- **Celery beat é instância única.** Duas instâncias executariam o reconciliador em
  dobro (inofensivo pela idempotência, mas desnecessário).
- **Pub/sub não guarda mensagens.** Um evento enviado com o usuário desconectado se perde;
  o front recarrega a lista a cada (re)conexão, então nada fica desatualizado. Para
  histórico de notificações, Redis Streams.
- **Observabilidade.** Próximo passo natural: métricas (tamanho da fila, tempo de
  processamento, taxa de erro por modelo) e um painel como o Flower.

## Rodando

```bash
npm run dev          # infra (Docker) + migrations + API + worker (com beat) + front
npm run infra        # só MariaDB, Redis e RabbitMQ
```

Com Docker Compose (inclui worker e beat separados):

```bash
cd backend
docker compose up --build
docker compose up --scale worker=3
```

Painel do RabbitMQ: http://localhost:15672 (booklens / booklens).
