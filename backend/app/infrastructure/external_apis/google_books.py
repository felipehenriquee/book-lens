import re
import httpx
from app.core.config import settings
from app.domain.models.ocr import EnrichedDetectedBook

_GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _safe_error(err: httpx.HTTPError) -> str:
    """Mensagem do erro sem a API key, que o httpx inclui na URL."""
    message = str(err)
    if settings.GOOGLE_BOOKS_API_KEY:
        message = message.replace(settings.GOOGLE_BOOKS_API_KEY, "***")
    return message


def build_enriched_detected_book(item: dict) -> EnrichedDetectedBook:
    """Converte um item cru da resposta da Google Books API no schema já
    usado pelo fluxo de OCR, para o front poder reaproveitar o mesmo
    componente de detalhes tanto na busca manual quanto no scan.
    """
    volume_info = item.get("volumeInfo", {})
    sale_info = item.get("saleInfo", {})
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
    title = volume_info.get("title", "")

    return EnrichedDetectedBook(
        title=title,
        authors=volume_info.get("authors", []),
        publisher=volume_info.get("publisher"),
        confidence=1.0,
        title_for_search=title,
        google_books_id=item.get("id"),
        # A API do Google Books devolve links http:// puros; forçamos https
        # para não serem bloqueados como mixed-content num front servido em https.
        cover_url=thumbnail.replace("http://", "https://", 1) if thumbnail else None,
        preview_link=volume_info.get("previewLink"),
        description=volume_info.get("description"),
        published_date=volume_info.get("publishedDate"),
        page_count=volume_info.get("pageCount"),
        categories=volume_info.get("categories", []),
        average_rating=volume_info.get("averageRating"),
        isbn_13=isbn_13,
        language=volume_info.get("language"),
        list_price_amount=list_price.get("amount"),
        list_price_currency=list_price.get("currencyCode"),
    )


class GoogleBooksClient:
    """Cliente para busca opcional de metadados adicionais de livros."""

    async def search_books(self, query: str, max_results: int = 5) -> list[dict]:
        """Busca múltiplos resultados por título, para uso em autocomplete."""
        params: dict[str, str] = {
            "q": f"intitle:{query}",
            "maxResults": str(max_results),
            "printType": "books",
            "orderBy": "relevance",
        }
        if settings.GOOGLE_BOOKS_API_KEY:
            params["key"] = settings.GOOGLE_BOOKS_API_KEY

        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": _USER_AGENT}) as client:
            try:
                response = await client.get(_GOOGLE_BOOKS_API_URL, params=params)
                response.raise_for_status()
            except httpx.HTTPError as err:
                print(f"Erro na requisição ao Google Books: {_safe_error(err)}")
                return []

        data = response.json()
        return data.get("items", [])

    async def get_by_id(self, volume_id: str) -> dict | None:
        """Busca um volume específico direto pelo ID, sem precisar buscar por título de novo."""
        params: dict[str, str] = {}
        if settings.GOOGLE_BOOKS_API_KEY:
            params["key"] = settings.GOOGLE_BOOKS_API_KEY

        async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": _USER_AGENT}) as client:
            try:
                response = await client.get(f"{_GOOGLE_BOOKS_API_URL}/{volume_id}", params=params)
                response.raise_for_status()
            except httpx.HTTPError as err:
                print(f"Erro na requisição ao Google Books: {_safe_error(err)}")
                return None

        return response.json()

    async def search_by_title(self, title: str, author: str | None = None) -> dict | None:
        # 1. Limpa o título (remove subtítulos após : ou -)
        clean_title = re.split(r'[:\-]', title)[0].strip()

        # 2. Monta a query sem qualificadores rígidos
        query = clean_title
        if author:
            clean_author = author.split()[0]
            query += f" {clean_author}"

        params: dict[str, str] = {
            "q": query,
            "maxResults": "1",
            "printType": "books",      # Garante que só retorne livros (ignora revistas)
            "orderBy": "relevance",     # Garante ordenação por relevância
        }

        if settings.GOOGLE_BOOKS_API_KEY:
            params["key"] = settings.GOOGLE_BOOKS_API_KEY

        # 3. Adiciona User-Agent nos headers para evitar bloqueios do Google
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            try:
                response = await client.get(_GOOGLE_BOOKS_API_URL, params=params)
                response.raise_for_status()
            except httpx.HTTPError as err:
                print(f"Erro na requisição ao Google Books: {_safe_error(err)}")
                return None

        data = response.json()
        items = data.get("items")
        return items[0] if items else None
    async def search_open_library(self, title: str, author: str | None = None) -> dict | None:
        # 1. Limpa o título simplificando o texto (remove o que vem depois de : ou -)
        clean_title = re.split(r'[:\-]', title)[0].strip()
        
        url = "https://openlibrary.org/search.json"
        params: dict[str, str] = {"title": clean_title, "limit": "1"}

        # 2. Se houver autor, podemos adicionar na busca para ser mais preciso
        if author:
            clean_author = author.split()[0]
            params["author"] = clean_author

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                docs = data.get("docs", [])
                return docs[0] if docs else None
            except httpx.HTTPError:
                return None