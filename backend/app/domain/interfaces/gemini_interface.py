from abc import ABC, abstractmethod

from app.domain.models.ocr import EnrichedBookScanResult


class GeminiClientInterface(ABC):
    @abstractmethod
    async def scan_image_for_books(self, image_bytes: bytes, mime_type: str) -> EnrichedBookScanResult: ...
