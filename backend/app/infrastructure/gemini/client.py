import asyncio
import logging
import re

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.core.config import settings
from app.domain.interfaces.gemini_interface import GeminiClientInterface, ModelsUnavailableError
from app.domain.interfaces.limits_interface import ModelRateLimiterInterface
from app.domain.models.ocr import BookScanResult, DetectedBook, EnrichedBookScanResult, EnrichedDetectedBook
from app.infrastructure.external_apis import google_books

logger = logging.getLogger(__name__)

_PROMPT = (
    "Análise a imagem fornecida contendo um ou mais livros.\n"
    "1. Extraia o título, os autores e a editora de CADA um dos livros visíveis na foto.\n"
    "2. Para cada livro, adicione o campo 'title_for_search' contendo uma versão simplificada e limpa do título "
    "(sem subtítulos longos, dois pontos ou pontuações), ideal para buscas diretas na API do Google Books.\n"
    "3. Para cada livro, preencha 'box_2d' com a caixa delimitadora do livro na imagem, "
    "no formato [ymin, xmin, ymax, xmax] normalizado de 0 a 1000.\n"
    "4. Retorne a resposta estritamente no formato JSON correspondente ao schema fornecido."
)

# A Gemini API retorna 503 UNAVAILABLE com frequência em picos de demanda;
# esses erros são transitórios e normalmente passam numa nova tentativa ou
# num modelo alternativo. "flash-latest"/"flash-lite-latest" são aliases
# mantidos pela Google apontando sempre para o modelo estável atual.
#
# Cada modelo leva o menor "thinking level" que aceita: pensar menos deixa a
# detecção (com box_2d) bem mais rápida. O flash não aceita MINIMAL e os
# modelos Gemini 3.x recusam o antigo thinking_budget=0 (400 INVALID_ARGUMENT).
_MODEL_CANDIDATES: list[tuple[str, types.ThinkingLevel]] = [
    ("gemini-flash-latest", types.ThinkingLevel.LOW),
    ("gemini-flash-lite-latest", types.ThinkingLevel.MINIMAL),
]
_ATTEMPTS_PER_MODEL = 2
_RETRY_BACKOFF_SECONDS = 2
# Sem limite, uma chamada travada na Gemini deixa o scan "pendurado" para
# sempre; o timeout vira erro 502 amigável no OCRService.
_REQUEST_TIMEOUT_MS = 45_000

# Pausa padrão de um modelo que respondeu 429 sem informar o retryDelay.
_DEFAULT_QUOTA_COOLDOWN_SECONDS = 60
# Espera sugerida quando o limite por minuto de todos os modelos foi atingido.
_RPM_WINDOW_SECONDS = 60

# Usado apenas quando settings.OCR_MOCK_ENABLED=true (ver core/config.py).
_MOCK_DETECTED_BOOK = DetectedBook(
    title="O Chamado do Cuco",
    authors=["Robert Galbraith"],
    title_for_search="O Chamado do Cuco",
    confidence=1.0,
)


class GeminiOCRClient(GeminiClientInterface):
    def __init__(self, rate_limiter: ModelRateLimiterInterface | None = None) -> None:
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        # Opcional: sem limitador (ex.: endpoint síncrono /ocr/scan) cada chamada
        # vai direto para a Gemini, sem coordenação entre processos.
        self._rate_limiter = rate_limiter

    async def scan_image_for_books(self, image_bytes: bytes, mime_type: str) -> EnrichedBookScanResult:
        if settings.OCR_MOCK_ENABLED:
            if settings.OCR_MOCK_DELAY_SECONDS > 0:
                await asyncio.sleep(settings.OCR_MOCK_DELAY_SECONDS)
            result = BookScanResult(detected_books=[_MOCK_DETECTED_BOOK])
        else:
            response = await self._generate_content_with_retry(image_bytes, mime_type)
            result = BookScanResult.model_validate_json(response.text)

        google_client = google_books.GoogleBooksClient()
        enriched_books = [await self._enrich(book, google_client) for book in result.detected_books]
        return EnrichedBookScanResult(detected_books=enriched_books)

    @staticmethod
    async def _enrich(
        book: DetectedBook, google_client: google_books.GoogleBooksClient
    ) -> EnrichedDetectedBook:
        author = book.authors[0] if book.authors else None
        google_book = await google_client.search_by_title(book.title_for_search, author)

        data = book.model_dump()

        if google_book:
            volume_info = google_book.get("volumeInfo", {})
            sale_info = google_book.get("saleInfo", {})
            image_links = volume_info.get("imageLinks", {})
            thumbnail = image_links.get("thumbnail") or image_links.get("smallThumbnail")
            list_price = sale_info.get("listPrice", {})
            isbn_13 = next(
                (
                    identifier["identifier"]
                    for identifier in volume_info.get("industryIdentifiers", [])
                    if identifier.get("type") == "ISBN_13"
                ),
                None,
            )

            data.update(
                google_books_id=google_book.get("id"),
                # A API do Google Books devolve links http:// puros; forçamos https
                # para não serem bloqueados como mixed-content num front servido em https.
                cover_url=thumbnail.replace("http://", "https://", 1) if thumbnail else None,
                preview_link=volume_info.get("previewLink"),
                # A editora do Google Books tende a ser mais confiável que a leitura via OCR.
                publisher=volume_info.get("publisher") or book.publisher,
                description=volume_info.get("description"),
                published_date=volume_info.get("publishedDate"),
                page_count=volume_info.get("pageCount"),
                categories=volume_info.get("categories", []),
                average_rating=volume_info.get("averageRating"),
                isbn_13=isbn_13,
                list_price_amount=list_price.get("amount"),
                list_price_currency=list_price.get("currencyCode"),
            )

        return EnrichedDetectedBook(**data)

    async def _generate_content_with_retry(self, image_bytes: bytes, mime_type: str):
        last_error: Exception | None = None
        # Menor espera entre os modelos pulados por limite/cota (para devolver o job à fila).
        retry_after: float | None = None

        for model, thinking_level in _MODEL_CANDIDATES:
            wait = await self._unavailable_for(model)
            if wait:
                retry_after = wait if retry_after is None else min(retry_after, wait)
                continue

            for attempt in range(1, _ATTEMPTS_PER_MODEL + 1):
                try:
                    # Cliente assíncrono (.aio): o síncrono bloqueava o event loop
                    # e travava a API inteira enquanto a Gemini respondia.
                    return await self.client.aio.models.generate_content(
                        model=model,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            _PROMPT,
                        ],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=BookScanResult,
                            temperature=0.1,
                            thinking_config=types.ThinkingConfig(thinking_level=thinking_level),
                            http_options=types.HttpOptions(timeout=_REQUEST_TIMEOUT_MS),
                        ),
                    )
                except genai_errors.ServerError as exc:
                    last_error = exc
                    if attempt < _ATTEMPTS_PER_MODEL:
                        await asyncio.sleep(_RETRY_BACKOFF_SECONDS * attempt)
                except genai_errors.ClientError as exc:
                    if exc.code == 429:
                        # Cota do modelo esgotada (cada modelo tem a sua): pausa o modelo
                        # para TODOS os workers pelo tempo que a Google informa, em vez
                        # de cada foto da fila tomar o mesmo 429.
                        cooldown = _retry_delay_seconds(exc) or _DEFAULT_QUOTA_COOLDOWN_SECONDS
                        logger.warning("Modelo %s sem cota; pausado por %ds", model, cooldown)
                        if self._rate_limiter:
                            await self._rate_limiter.cooldown(model, cooldown)
                        retry_after = cooldown if retry_after is None else min(retry_after, cooldown)
                        break
                    # 400 = configuração não suportada por este modelo (ex.: thinking
                    # level após a Google trocar o alias): repetir não adianta.
                    if exc.code != 400:
                        raise
                    logger.warning("Modelo %s recusou a requisição: %s", model, exc)
                    last_error = exc
                    break
                except httpx.TimeoutException as exc:
                    # Sem resposta em _REQUEST_TIMEOUT_MS (modelo sobrecarregado ou foto
                    # pesada de analisar): repetir no mesmo modelo seria esperar de novo
                    # à toa, então passa direto para o próximo.
                    logger.warning("Modelo %s não respondeu em %ds", model, _REQUEST_TIMEOUT_MS // 1000)
                    last_error = exc
                    break

        if retry_after is not None:
            # Algum modelo foi pulado por limite/cota (e os outros, se tentados,
            # falharam): o scan volta para a fila em vez de falhar, porque o
            # modelo pulado volta a ficar disponível depois de `retry_after`.
            raise ModelsUnavailableError(retry_after)
        assert last_error is not None
        raise last_error

    async def _unavailable_for(self, model: str) -> float:
        """Segundos até o modelo poder ser usado (0 = pode chamar agora; a vaga já fica reservada)."""
        if self._rate_limiter is None:
            return 0
        remaining = await self._rate_limiter.cooldown_remaining(model)
        if remaining:
            return remaining
        if not await self._rate_limiter.try_acquire(model):
            return _RPM_WINDOW_SECONDS
        return 0


def _retry_delay_seconds(exc: Exception) -> float | None:
    """Lê o "retryDelay" (ex.: '24145s') que a Google manda no corpo do 429."""
    match = re.search(r"retryDelay['\"]?\s*:\s*['\"](\d+(?:\.\d+)?)s", str(exc))
    return float(match.group(1)) if match else None
