import asyncio
from uuid import UUID

from app.domain.interfaces.task_queue_interface import TaskQueueInterface
from app.worker.celery_app import PROCESS_SCAN_TASK, SCAN_QUEUE, celery_app


class CeleryTaskQueue(TaskQueueInterface):
    """Publica as tarefas no RabbitMQ pelo nome (send_task), sem importar os workers."""

    async def enqueue_scan(self, job_id: UUID) -> None:
        # A publicação do Celery é síncrona (rede até o RabbitMQ, com confirmação
        # do broker): roda em thread para não bloquear o event loop da API.
        await asyncio.to_thread(
            celery_app.send_task, PROCESS_SCAN_TASK, args=[str(job_id)], queue=SCAN_QUEUE
        )
