import asyncio

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.core.config import settings
from app.domain.interfaces.gemini_interface import GeminiClientInterface
from app.domain.models.ocr import BookScanResult, DetectedBook, EnrichedBookScanResult, EnrichedDetectedBook
from app.infrastructure.external_apis import google_books

_PROMPT = (
    "Análise a imagem fornecida contendo um ou mais livros.\n"
    "1. Extraia o título, os autores e a editora de CADA um dos livros visíveis na foto.\n"
    "2. Para cada livro, adicione o campo 'title_for_search' contendo uma versão simplificada e limpa do título "
    "(sem subtítulos longos, dois pontos ou pontuações), ideal para buscas diretas na API do Google Books.\n"
    "3. Retorne a resposta estritamente no formato JSON correspondente ao schema fornecido."
)

# A Gemini API retorna 503 UNAVAILABLE com frequência em picos de demanda;
# esses erros são transitórios e normalmente passam numa nova tentativa ou
# num modelo alternativo. "flash-latest"/"flash-lite-latest" são aliases
# mantidos pela Google apontando sempre para o modelo estável atual.
_MODEL_CANDIDATES = ["gemini-flash-latest", "gemini-flash-lite-latest"]
_ATTEMPTS_PER_MODEL = 2
_RETRY_BACKOFF_SECONDS = 2

# Usado apenas quando settings.OCR_MOCK_ENABLED=true (ver core/config.py).
_MOCK_DETECTED_BOOK = DetectedBook(
    title="O Chamado do Cuco",
    authors=["Robert Galbraith"],
    title_for_search="O Chamado do Cuco",
    confidence=1.0,
)


class GeminiOCRClient(GeminiClientInterface):
    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)

    async def scan_image_for_books(self, image_bytes: bytes, mime_type: str) -> EnrichedBookScanResult:
        if settings.OCR_MOCK_ENABLED:
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
        last_error: genai_errors.ServerError | None = None
        for model in _MODEL_CANDIDATES:
            for attempt in range(1, _ATTEMPTS_PER_MODEL + 1):
                try:
                    return self.client.models.generate_content(
                        model=model,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            _PROMPT,
                        ],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=BookScanResult,
                            temperature=0.1,
                        ),
                    )
                except genai_errors.ServerError as exc:
                    last_error = exc
                    if attempt < _ATTEMPTS_PER_MODEL:
                        await asyncio.sleep(_RETRY_BACKOFF_SECONDS * attempt)
        assert last_error is not None
        raise last_error
