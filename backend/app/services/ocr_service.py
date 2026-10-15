import io
import logging

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.domain.interfaces.gemini_interface import GeminiClientInterface
from app.domain.models.ocr import EnrichedBookScanResult

logger = logging.getLogger(__name__)


class OCRService:
    def __init__(self, gemini_client: GeminiClientInterface) -> None:
        self._gemini_client = gemini_client

    async def scan_upload(self, file: UploadFile) -> EnrichedBookScanResult:
        self._validate_content_type(file.content_type)

        raw_bytes = await file.read()
        self._validate_size(len(raw_bytes))

        # Processamento inteiramente em memória, sem persistir o arquivo em disco.
        buffer = io.BytesIO(raw_bytes)

        try:
            return await self._gemini_client.scan_image_for_books(
                image_bytes=buffer.getvalue(), mime_type=file.content_type
            )
        except Exception as exc:  # erros de rede/parsing da Gemini API
            logger.exception("Falha ao chamar a Gemini API para OCR")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao processar a imagem com o serviço de OCR.",
            ) from exc

    @staticmethod
    def _validate_content_type(content_type: str | None) -> None:
        if content_type not in settings.ALLOWED_IMAGE_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    "Formato de imagem não suportado. "
                    f"Utilize um dos formatos: {', '.join(sorted(settings.ALLOWED_IMAGE_CONTENT_TYPES))}."
                ),
            )

    @staticmethod
    def _validate_size(size_bytes: int) -> None:
        if size_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Arquivo excede o tamanho máximo permitido de 10MB.",
            )
