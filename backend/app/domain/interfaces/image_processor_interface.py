from abc import ABC, abstractmethod

from pydantic import BaseModel


class PreparedImage(BaseModel):
    """Foto pronta para a fila: a versão enviada à Gemini e a miniatura da revisão.

    As duas saem da mesma imagem já rotacionada, para que as coordenadas
    (box_2d) devolvidas pela Gemini batam com a miniatura mostrada no front.
    """

    image: bytes
    thumbnail: bytes
    mime_type: str = "image/jpeg"


class InvalidImageError(ValueError):
    """O arquivo enviado não é uma imagem que conseguimos abrir."""


class ImageProcessorInterface(ABC):
    @abstractmethod
    async def prepare(self, data: bytes) -> PreparedImage: ...
