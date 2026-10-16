from abc import ABC, abstractmethod
from uuid import UUID


class TaskQueueInterface(ABC):
    """Entrega trabalho para os workers (hoje: Celery + RabbitMQ).

    O estado do job vive no banco; a fila só leva o "processe o job X". Por
    isso publicar é seguro de repetir (o worker ignora jobs que não estão na
    fila) e uma publicação perdida é recuperada pelo reconciliador.
    """

    @abstractmethod
    async def enqueue_scan(self, job_id: UUID) -> None: ...
