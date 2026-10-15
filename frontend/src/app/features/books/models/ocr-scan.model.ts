import { BookFormat, ReadingStatus } from './book.model';

export class DetectedBook {
  /** Caixa do livro na foto: [ymin, xmin, ymax, xmax] normalizado 0–1000 (vazio se a Gemini não informar). */
  box2d: number[] = [];
  /** Idioma no Google Books (ISO 639-1, ex.: "pt"). */
  language?: string;

  constructor(
    public title: string,
    public authors: string[],
    public publisher?: string,
    public confidence: number = 0.0,
    public googleBooksId?: string,
    public coverUrl?: string,
    public previewLink?: string,
    public description?: string,
    public publishedDate?: string,
    public pageCount?: number,
    public categories: string[] = [],
    public averageRating?: number,
    public isbn13?: string,
    public listPriceAmount?: number,
    public listPriceCurrency?: string,
    // Dados pessoais, preenchidos por mim no modal de detalhes (não vêm da Gemini/Google Books).
    public format?: BookFormat,
    public readingStatus: ReadingStatus = 'UNREAD',
    public rating?: number,
    public purchaseDate?: string,
    public isGifted: boolean = false,
    public paidPrice?: number,
    public readDate?: string,
    public userNotes?: string
  ) {}

  static fromJson(json: any): DetectedBook {
    const book = new DetectedBook(
      json.title,
      json.authors || [],
      json.publisher,
      json.confidence || 0.0,
      json.google_books_id,
      json.cover_url,
      json.preview_link,
      json.description,
      json.published_date,
      json.page_count,
      json.categories || [],
      json.average_rating,
      json.isbn_13,
      json.list_price_amount,
      json.list_price_currency
    );
    book.box2d = Array.isArray(json.box_2d) && json.box_2d.length === 4 ? json.box_2d : [];
    book.language = json.language ?? undefined;
    return book;
  }
}

export class BookScanResult {
  constructor(public detectedBooks: DetectedBook[]) {}

  static fromJson(json: any): BookScanResult {
    const books = (json.detected_books || []).map((b: any) => DetectedBook.fromJson(b));
    return new BookScanResult(books);
  }
}
