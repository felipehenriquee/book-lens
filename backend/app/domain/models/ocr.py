from pydantic import BaseModel, Field


class DetectedBook(BaseModel):
    """Schema usado como response_schema da Gemini API: deve conter só o que o
    modelo consegue extrair da própria imagem, para não induzi-lo a alucinar
    campos que só existem depois do enriquecimento (ex: capa do Google Books).
    """

    title: str = Field(description="Título do livro identificado")
    authors: list[str] = Field(default=[], description="Lista com o nome dos autores")
    publisher: str | None = Field(default=None, description="Nome da editora, se visível")
    confidence: float = Field(default=0.0, description="Nível de confiança da detecção (0.0 a 1.0)")
    title_for_search: str = Field(
        ...,
        description="Título simplificado e limpo sem subtítulos ou pontuações, otimizado para busca de texto.",
    )


class BookScanResult(BaseModel):
    detected_books: list[DetectedBook] = Field(description="Lista de livros encontrados na imagem")


class EnrichedDetectedBook(DetectedBook):
    """DetectedBook com metadados obtidos via Google Books após a detecção do Gemini.

    Esses campos são transitórios: usados só para exibir o modal de detalhes
    no momento do scan. O que efetivamente é salvo no livro está em
    `domain.models.book.BookBase` (bem mais enxuto).
    """

    google_books_id: str | None = Field(default=None, description="Volume ID no Google Books")
    cover_url: str | None = Field(default=None, description="URL da capa, obtida via Google Books")
    preview_link: str | None = Field(
        default=None, description="Link de pré-visualização do livro no Google Books"
    )
    description: str | None = Field(default=None, description="Sinopse do livro")
    published_date: str | None = Field(default=None, description="Data de publicação")
    page_count: int | None = Field(default=None, description="Número de páginas")
    categories: list[str] = Field(default_factory=list, description="Categorias/gêneros")
    average_rating: float | None = Field(default=None, description="Nota média no Google Books")
    isbn_13: str | None = Field(default=None, description="ISBN-13, se disponível")
    list_price_amount: float | None = Field(default=None, description="Preço de tabela no Google Books")
    list_price_currency: str | None = Field(default=None, description="Moeda do preço de tabela")


class EnrichedBookScanResult(BaseModel):
    detected_books: list[EnrichedDetectedBook] = Field(
        description="Livros encontrados na imagem, já enriquecidos com dados do Google Books"
    )
