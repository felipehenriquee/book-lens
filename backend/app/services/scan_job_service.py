import logging
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.domain.interfaces.image_processor_interface import ImageProcessorInterface, InvalidImageError
from app.domain.interfaces.repository_interface import ScanJobRepositoryInterface
from app.domain.interfaces.storage_interface import StorageInterface
from app.domain.interfaces.task_queue_interface import TaskQueueInterface
from app.domain.models.scan_job import (
    RejectedFile,
    ScanJobDetail,
    ScanJobFiles,
    ScanJobRead,
    ScanUploadResult,
)

logger = logging.getLogger(__name__)


class _RejectedPhoto(Exception):
    """Uma foto do upload foi recusada; `reason` é mostrado ao usuário."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class ScanJobService:
    """Operações do usuário sobre a fila de scans. O processamento fica no ScanProcessor (workers do Celery)."""

    def __init__(
        self,
        repository: ScanJobRepositoryInterface,
        storage: StorageInterface,
        image_processor: ImageProcessorInterface,
        task_queue: TaskQueueInterface,
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._image_processor = image_processor
        self._task_queue = task_queue

    async def enqueue(self, user_id: UUID, files: list[UploadFile]) -> ScanUploadResult:
        if not files:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Envie pelo menos uma foto.")
        if len(files) > settings.SCAN_MAX_FILES_PER_UPLOAD:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Envie no máximo {settings.SCAN_MAX_FILES_PER_UPLOAD} fotos por vez.",
            )

        # Cada foto é independente: uma foto ruim não impede as outras de entrarem
        # na fila. As recusadas voltam para o usuário com o motivo.
        jobs: list[ScanJobRead] = []
        rejected: list[RejectedFile] = []
        for file in files:
            try:
                jobs.append(await self._enqueue_one(user_id, file))
            except _RejectedPhoto as exc:
                rejected.append(RejectedFile(filename=file.filename, reason=exc.reason))

        if not jobs:
            reasons = " ".join(f"{item.filename or 'Arquivo'}: {item.reason}" for item in rejected)
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Nenhuma foto foi enviada. {reasons}"
            )
        return ScanUploadResult(jobs=jobs, rejected=rejected)

    async def _enqueue_one(self, user_id: UUID, file: UploadFile) -> ScanJobRead:
        """Valida, normaliza e grava uma foto. Lança _RejectedPhoto com o motivo se falhar."""
        if file.content_type not in settings.ALLOWED_IMAGE_CONTENT_TYPES:
            raise _RejectedPhoto("Formato não suportado. Envie JPEG, PNG ou WEBP.")

        data = await file.read()
        if len(data) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise _RejectedPhoto("Arquivo maior que 10MB.")

        try:
            image = await self._image_processor.prepare(data)
        except InvalidImageError as exc:
            raise _RejectedPhoto("Não foi possível abrir a imagem (arquivo corrompido ou não é uma foto).") from exc

        key = uuid4().hex
        files = ScanJobFiles(image_key=f"{key}.jpg", thumbnail_key=f"{key}_thumb.jpg")
        try:
            await self._storage.save(files.image_key, image.image)
            await self._storage.save(files.thumbnail_key, image.thumbnail)
            job = await self._repository.create(user_id, files.image_key, files.thumbnail_key, file.filename)
        except Exception as exc:
            # Falha do servidor (disco, banco): apaga o que já foi gravado desta foto
            # para não deixar arquivo órfão, e segue com as próximas.
            logger.exception("Falha ao gravar a foto %s na fila", file.filename)
            await delete_job_files(self._storage, files)
            raise _RejectedPhoto("Erro ao salvar a foto no servidor. Tente novamente.") from exc

        await self._publish(job.id)
        return job

    async def _publish(self, job_id: UUID) -> None:
        """Publica a tarefa na fila (padrão outbox: o job já está salvo no banco).

        Se o RabbitMQ estiver fora do ar, o upload NÃO falha: o job fica QUEUED
        sem `enqueued_at` e o reconciliador (Celery beat) publica depois.
        """
        try:
            await self._task_queue.enqueue_scan(job_id)
            await self._repository.mark_enqueued(job_id)
        except Exception:
            logger.warning("Fila indisponível; o scan %s será publicado pelo reconciliador", job_id, exc_info=True)

    async def list_jobs(self, user_id: UUID) -> list[ScanJobRead]:
        return await self._repository.list_by_owner(user_id)

    async def get_job(self, user_id: UUID, job_id: UUID) -> ScanJobDetail:
        job = await self._repository.get_by_id(job_id, user_id)
        if job is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan não encontrado.")
        return job

    async def get_thumbnail(self, user_id: UUID, job_id: UUID) -> bytes:
        await self.get_job(user_id, job_id)  # garante que o job é do usuário
        files = await self._repository.get_files(job_id)
        data = await self._storage.read(files.thumbnail_key) if files and files.thumbnail_key else None
        if data is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Miniatura não disponível.")
        return data

    async def retry(self, user_id: UUID, job_id: UUID) -> ScanJobRead:
        job = await self._repository.requeue(job_id, user_id)
        if job is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Só é possível tentar de novo um scan que falhou e ainda tem a foto guardada.",
            )
        await self._publish(job.id)
        return job

    async def delete(self, user_id: UUID, job_id: UUID) -> None:
        files = await self._repository.delete(job_id, user_id)
        if files is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan não encontrado.")
        await delete_job_files(self._storage, files)


async def delete_job_files(storage: StorageInterface, files: ScanJobFiles) -> None:
    for key in (files.image_key, files.thumbnail_key):
        if key:
            try:
                await storage.delete(key)
            except OSError:
                # Arquivo órfão não deve impedir a remoção do job; só registra.
                logger.warning("Não foi possível apagar o arquivo %s do storage", key)
