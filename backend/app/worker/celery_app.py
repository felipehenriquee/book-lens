"""Aplicação Celery: workers da fila de scans, com RabbitMQ como broker.

Rodar o worker (com o agendador "beat" embutido, para desenvolvimento):
    celery -A app.worker.celery_app worker -B --loglevel=INFO
Em produção o beat roda em um processo separado (um só!):
    celery -A app.worker.celery_app beat --loglevel=INFO
"""

from pathlib import Path

from celery import Celery
from kombu import Queue

from app.core.config import settings

SCAN_QUEUE = "scans"

# Nomes das tarefas: a API publica pelo nome (send_task), sem importar o código
# dos workers (e suas dependências pesadas, como Pillow e o SDK da Gemini).
PROCESS_SCAN_TASK = "scans.process"
RECONCILE_TASK = "scans.reconcile"
PURGE_EXPIRED_TASK = "scans.purge_expired"

celery_app = Celery("booklens", broker=settings.CELERY_BROKER_URL, include=["app.worker.tasks"])

celery_app.conf.update(
    task_default_queue=SCAN_QUEUE,
    # Fila durável: sobrevive a um reinício do RabbitMQ.
    task_queues=(Queue(SCAN_QUEUE, durable=True),),
    # --- Garantias de entrega -------------------------------------------------
    # Só confirma (ack) a mensagem DEPOIS de processar: se o worker morrer no
    # meio, o RabbitMQ entrega a tarefa de novo para outro worker.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Cada processo pega 1 tarefa por vez: tarefas longas (10–90s) não ficam
    # "presas" na memória de um worker ocupado enquanto outro está livre.
    worker_prefetch_multiplier=1,
    # O RabbitMQ confirma o recebimento de cada publicação (publisher confirms):
    # se o upload respondeu 202, a tarefa está mesmo na fila.
    broker_transport_options={"confirm_publish": True},
    # Com o RabbitMQ fora do ar, falha rápido no upload (o job fica salvo no
    # banco e o reconciliador publica depois) em vez de travar a requisição.
    task_publish_retry_policy={"max_retries": 2, "interval_start": 0, "interval_step": 0.5, "interval_max": 1},
    broker_connection_retry_on_startup=True,
    # --- Execução -------------------------------------------------------------
    worker_concurrency=settings.SCAN_WORKER_CONCURRENCY,
    task_time_limit=settings.SCAN_TASK_TIME_LIMIT_SECONDS,
    task_soft_time_limit=settings.SCAN_TASK_TIME_LIMIT_SECONDS - 15,
    # O estado de cada job vive no MariaDB: não precisamos de result backend.
    task_ignore_result=True,
    timezone="UTC",
    # --- Tarefas agendadas (Celery beat) ---------------------------------------
    beat_schedule={
        "reconcile-lost-scans": {"task": RECONCILE_TASK, "schedule": 60.0},
        "purge-expired-scans": {"task": PURGE_EXPIRED_TASK, "schedule": 3600.0},
    },
    beat_schedule_filename=str(Path(settings.SCAN_STORAGE_DIR).parent / "celerybeat-schedule"),
)
