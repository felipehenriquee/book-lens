from abc import ABC, abstractmethod

from app.domain.models.ocr import EnrichedBookScanResult


class ModelsUnavailableError(Exception):
    """Nenhum modelo pode atender agora (limite por minuto atingido ou cota esgotada).

    Não é uma falha da foto: o scan deve voltar para a fila e ser tentado
    depois de `retry_after` segundos.
    """

    def __init__(self, retry_after: float) -> None:
        super().__init__(f"Nenhum modelo disponível; tentar de novo em {retry_after:.0f}s")
        self.retry_after = retry_after


class GeminiClientInterface(ABC):
    @abstractmethod
    async def scan_image_for_books(self, image_bytes: bytes, mime_type: str) -> EnrichedBookScanResult: ...
