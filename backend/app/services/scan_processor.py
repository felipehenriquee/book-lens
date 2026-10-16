import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from enum import Enum
from uuid import UUID

from app.domain.interfaces.gemini_interface import GeminiClientInterface, ModelsUnavailableError
from app.domain.interfaces.limits_interface import UserSlotsInterface
from app.domain.interfaces.notifier_interface import NotifierInterface
from app.domain.interfaces.repository_interface import ScanJobRepositoryInterface
from app.domain.interfaces.storage_interface import StorageInterface
from app.domain.models.scan_job import ScanJobStatus
from app.services.scan_job_service import delete_job_files

logger = logging.getLogger(__name__)

RepositoryScope = Callable[[], AbstractAsyncContextManager[ScanJobRepositoryInterface]]

# Nome do evento SSE com o estado atualizado de um job (ver /notifications/stream).
SCAN_JOB_EVENT = "scan_job"

QUOTA_EXHAUSTED_MESSAGE = "Limite de uso da IA atingido por hoje. Tente novamente mais tarde."
GENERIC_FAILURE_MESSAGE = "Não foi possível analisar esta foto. Tente novamente."


class ScanOutcome(str, Enum):
    DONE = "done"
    FAILED = "failed"
    # Nada a fazer: job apagado, já concluído ou pego por outro worker (entrega duplicada).
    SKIPPED = "skipped"
    # Tentar de novo mais tarde: usuário com o máximo de fotos em análise, ou
    # nenhum modelo de IA disponível agora. O job continua QUEUED.
    RETRY_LATER = "retry_later"


@dataclass(frozen=True)
class ScanResult:
    outcome: ScanOutcome
    retry_after: float = 0.0


class ScanProcessor:
    """Processa um job da fila de scans. Não sabe nada de Celery/RabbitMQ:

    a tarefa do Celery só chama `process()` e decide, pelo resultado, se
    reagenda. Isso mantém a regra de negócio testável e trocável de broker.
    """

    def __init__(
        self,
        repository_scope: RepositoryScope,
        storage: StorageInterface,
        gemini_client: GeminiClientInterface,
        notifier: NotifierInterface,
        user_slots: UserSlotsInterface,
        user_busy_retry_seconds: float,
        max_wait_for_quota_seconds: float,
    ) -> None:
        self._repository_scope = repository_scope
        self._storage = storage
        self._gemini_client = gemini_client
        self._notifier = notifier
        self._user_slots = user_slots
        self._user_busy_retry_seconds = user_busy_retry_seconds
        self._max_wait_for_quota_seconds = max_wait_for_quota_seconds

    async def process(self, job_id: UUID, redelivered: bool = False) -> ScanResult:
        async with self._repository_scope() as repository:
            found = await repository.get_with_owner(job_id)
        if found is None:
            return ScanResult(ScanOutcome.SKIPPED)  # o usuário apagou o scan enquanto esperava
        user_id, job = found
        if job.status in (ScanJobStatus.DONE, ScanJobStatus.FAILED):
            return ScanResult(ScanOutcome.SKIPPED)

        # Justiça: limita as fotos simultâneas do mesmo usuário. Sem vaga, a
        # tarefa volta para o FIM da fila e os outros usuários passam na frente.
        if not await self._user_slots.try_acquire(user_id):
            return ScanResult(ScanOutcome.RETRY_LATER, self._user_busy_retry_seconds)
        try:
            return await self._process_claimed(job_id, user_id, redelivered)
        finally:
            await self._user_slots.release(user_id)

    async def _process_claimed(self, job_id: UUID, user_id: UUID, redelivered: bool) -> ScanResult:
        async with self._repository_scope() as repository:
            # Atômico: numa entrega duplicada, só um worker consegue reservar o job.
            if not await repository.claim(job_id, allow_reclaim=redelivered):
                return ScanResult(ScanOutcome.SKIPPED)
            files = await repository.get_files(job_id)
        await self._notify(job_id)  # PROCESSING: o front mostra "analisando…"

        image = await self._storage.read(files.image_key) if files and files.image_key else None
        if image is None:
            await self._fail(job_id, "A foto deste scan não está mais disponível. Envie novamente.")
            # Sem foto não há como "tentar de novo": esquece a chave para o retry recusar.
            async with self._repository_scope() as repository:
                await repository.clear_image_key(job_id)
            return ScanResult(ScanOutcome.FAILED)

        logger.info("Processando scan %s", job_id)
        try:
            result = await self._gemini_client.scan_image_for_books(image_bytes=image, mime_type="image/jpeg")
        except ModelsUnavailableError as exc:
            if exc.retry_after > self._max_wait_for_quota_seconds:
                # Ex.: cota diária esgotada em todos os modelos — só volta em horas.
                await self._fail(job_id, QUOTA_EXHAUSTED_MESSAGE)
                return ScanResult(ScanOutcome.FAILED)
            # Limite por minuto: volta para a fila e tenta daqui a pouco.
            async with self._repository_scope() as repository:
                await repository.release_to_queue(job_id)
            await self._notify(job_id)
            logger.info("Scan %s aguardando a IA por %.0fs", job_id, exc.retry_after)
            return ScanResult(ScanOutcome.RETRY_LATER, exc.retry_after)
        except Exception:
            logger.exception("Falha ao processar o scan %s", job_id)
            # A foto original fica guardada para permitir "tentar de novo".
            await self._fail(job_id, GENERIC_FAILURE_MESSAGE)
            return ScanResult(ScanOutcome.FAILED)

        async with self._repository_scope() as repository:
            await repository.mark_done(job_id, result)
        # Processado com sucesso: a foto original não é mais necessária (fica só a miniatura).
        await self._storage.delete(files.image_key)
        async with self._repository_scope() as repository:
            await repository.clear_image_key(job_id)
        logger.info("Scan %s concluído: %d livro(s)", job_id, len(result.detected_books))
        await self._notify(job_id)
        return ScanResult(ScanOutcome.DONE)

    async def mark_enqueued(self, job_id: UUID) -> None:
        async with self._repository_scope() as repository:
            await repository.mark_enqueued(job_id)

    async def find_stuck(
        self, unpublished_after_s: int, processing_after_s: int, published_after_s: int
    ) -> list[UUID]:
        async with self._repository_scope() as repository:
            return await repository.find_stuck(unpublished_after_s, processing_after_s, published_after_s)

    async def purge_expired(self, retention_days: int) -> int:
        async with self._repository_scope() as repository:
            expired = await repository.delete_older_than_days(retention_days)
        for files in expired:
            await delete_job_files(self._storage, files)
        return len(expired)

    async def _fail(self, job_id: UUID, message: str) -> None:
        async with self._repository_scope() as repository:
            await repository.mark_failed(job_id, message)
        await self._notify(job_id)

    async def _notify(self, job_id: UUID) -> None:
        """Avisa o dono do job do novo estado. Falhar aqui nunca interrompe o processamento."""
        try:
            async with self._repository_scope() as repository:
                found = await repository.get_with_owner(job_id)
            if found is not None:
                user_id, job = found
                await self._notifier.publish(user_id, SCAN_JOB_EVENT, job.model_dump(mode="json"))
        except Exception:
            logger.exception("Falha ao notificar o estado do scan %s", job_id)
