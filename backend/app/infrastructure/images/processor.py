import asyncio
import io

from PIL import Image, ImageOps, UnidentifiedImageError

from app.domain.interfaces.image_processor_interface import (
    ImageProcessorInterface,
    InvalidImageError,
    PreparedImage,
)

# Fotos de celular de 12+ MP descomprimidas passam fácil de 100MB em memória;
# acima disso é mais provável ser um arquivo malicioso ("decompression bomb").
Image.MAX_IMAGE_PIXELS = 60_000_000


class PillowImageProcessor(ImageProcessorInterface):
    def __init__(self, max_side: int, thumbnail_max_side: int) -> None:
        self._max_side = max_side
        self._thumbnail_max_side = thumbnail_max_side

    async def prepare(self, data: bytes) -> PreparedImage:
        # Pillow é CPU-bound: roda em thread para não travar o event loop.
        return await asyncio.to_thread(self._prepare_sync, data)

    def _prepare_sync(self, data: bytes) -> PreparedImage:
        try:
            with Image.open(io.BytesIO(data)) as source:
                # Aplica a rotação do EXIF (celulares salvam "deitado" + flag) e
                # descarta os metadados, inclusive localização GPS.
                image = ImageOps.exif_transpose(source).convert("RGB")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise InvalidImageError("Não foi possível abrir a imagem enviada.") from exc

        full = image.copy()
        full.thumbnail((self._max_side, self._max_side), Image.Resampling.LANCZOS)
        image.thumbnail((self._thumbnail_max_side, self._thumbnail_max_side), Image.Resampling.LANCZOS)

        return PreparedImage(image=self._to_jpeg(full, quality=88), thumbnail=self._to_jpeg(image, quality=80))

    @staticmethod
    def _to_jpeg(image: Image.Image, quality: int) -> bytes:
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        return buffer.getvalue()
