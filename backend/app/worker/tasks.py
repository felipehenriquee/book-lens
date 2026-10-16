"""Tarefas do Celery: adaptadores finos sobre o ScanProcessor.

Toda a regra de negócio está em app/services/scan_processor.py; aqui só se
traduz o resultado em comportamento de fila (reagendar, tentar de novo).
"""

import asyncio
from typing import Any
from uuid import UUID

from celery import Task
from celery.signals import worker_process_init
from celery.utils.log import get_task_logger

from app.core.config import settings
from app.services.scan_processor import ScanOutcome
from app.worker import container
from app.worker.celery_app import (
    PROCESS_SCAN_TASK,
    PURGE_EXPIRED_TASK,
    RECONCILE_TASK,
    SCAN_QUEUE,
    celery_app,
)

logger = get_task_logger(__name__)

# Falhas de infraestrutura (banco/Redis fora do ar): novas tentativas antes de
# desistir; depois disso o reconciliador ainda recupera o job.
_INFRA_MAX_RETRIES = 5
_INFRA_RETRY_SECONDS = 10

# Cada processo filho mantém UM event loop para todas as suas tarefas: os pools
# de conexão assíncronos (SQLAlchemy, Redis) ficam presos ao loop em que foram
# criados, então um asyncio.run() por tarefa quebraria as conexões reaproveitadas.
_loop: asyncio.AbstractEventLoop | None = None


def _run(coro: Any) -> Any:
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
    return _loop.run_until_complete(coro)


@worker_process_init.connect
def _on_process_start(**_: Any) -> None:
    global _loop
    _loop = None
    container.reset()


@celery_app.task(name=PROCESS_SCAN_TASK, bind=True, max_retries=None)
def process_scan(self: Task, job_id: str) -> str:
    # True quando o RabbitMQ entrega de novo uma tarefa cujo worker morreu
    # (acks_late): autoriza retomar um job que ficou PROCESSING.
    redelivered = bool((self.request.delivery_info or {}).get("redelivered"))
    processor = container.get_processor()
    try:
        result = _run(processor.process(UUID(job_id), redelivered=redelivered))
    except Exception as exc:
        logger.exception("Erro de infraestrutura no scan %s", job_id)
        raise self.retry(exc=exc, countdown=_INFRA_RETRY_SECONDS, max_retries=_INFRA_MAX_RETRIES)

    if result.outcome == ScanOutcome.RETRY_LATER:
        # Republica com atraso (vai para o fim da fila): usuário no limite de
        # fotos simultâneas, ou IA no limite por minuto.
        _run(processor.mark_enqueued(UUID(job_id)))
        raise self.retry(countdown=max(1, round(result.retry_after)), max_retries=None)
    return result.outcome.value


@celery_app.task(name=RECONCILE_TASK)
def reconcile_lost_scans() -> int:
    """Republica jobs cuja tarefa se perdeu (padrão outbox). Roda a cada minuto (beat)."""
    processor = container.get_processor()
    stuck = _run(
        processor.find_stuck(
            unpublished_after_s=settings.SCAN_RECONCILE_UNPUBLISHED_SECONDS,
            processing_after_s=settings.SCAN_RECONCILE_PROCESSING_SECONDS,
            published_after_s=settings.SCAN_RECONCILE_PUBLISHED_SECONDS,
        )
    )
    for job_id in stuck:
        process_scan.apply_async(args=[str(job_id)], queue=SCAN_QUEUE)
        _run(processor.mark_enqueued(job_id))
    if stuck:
        logger.warning("Reconciliador republicou %d scan(s) perdido(s)", len(stuck))
    return len(stuck)


@celery_app.task(name=PURGE_EXPIRED_TASK)
def purge_expired_scans() -> int:
    """Apaga scans não revisados após o prazo de retenção. Roda a cada hora (beat)."""
    removed = _run(container.get_processor().purge_expired(settings.SCAN_JOB_RETENTION_DAYS))
    if removed:
        logger.info("%d scan(s) expirado(s) removido(s)", removed)
    return removed
