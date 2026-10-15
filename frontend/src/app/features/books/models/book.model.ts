export type ReadingStatus = 'UNREAD' | 'READING' | 'READ' | 'PAUSED' | 'ABANDONED';
export type BookFormat = 'PAPERBACK' | 'HARDCOVER' | 'EBOOK' | 'POCKET';

export class Book {
  /** Quem deu o livro (só quando isGifted). */
  giftedBy?: string;
  /** Página em que parei (status "Lendo"). */
  currentPage?: number;
  /** Total de páginas, salvo para mostrar o progresso sem consultar o Google Books. */
  pageCount?: number;

  constructor(
    public id: string,
    public title: string,
    public author: string,
    public publisher?: string,
    public coverUrl?: string,
    public googleBooksId?: string,
    public format?: BookFormat,
    public readingStatus: ReadingStatus = 'UNREAD',
    public rating?: number,
    public purchaseDate?: string,
    public isGifted: boolean = false,
    public paidPrice?: number,
    public readDate?: string,
    public userNotes?: string,
    public createdAt?: Date
  ) {}

  static fromJson(json: any): Book {
    const book = new Book(
      json.id,
      json.title,
      json.author,
      json.publisher,
      json.cover_url,
      json.google_books_id,
      json.format,
      json.reading_status ?? 'UNREAD',
      json.rating,
      json.purchase_date,
      json.is_gifted ?? false,
      json.paid_price ? parseFloat(json.paid_price) : undefined,
      json.read_date,
      json.user_notes,
      json.created_at ? new Date(json.created_at) : undefined
    );
    book.giftedBy = json.gifted_by ?? undefined;
    book.currentPage = json.current_page ?? undefined;
    book.pageCount = json.page_count ?? undefined;
    return book;
  }

  toJson(): any {
    return {
      title: this.title,
      author: this.author,
      publisher: this.publisher,
      cover_url: this.coverUrl,
      google_books_id: this.googleBooksId,
      format: this.format,
      reading_status: this.readingStatus,
      rating: this.rating,
      purchase_date: this.purchaseDate,
      is_gifted: this.isGifted,
      paid_price: this.paidPrice,
      read_date: this.readDate,
      user_notes: this.userNotes,
      gifted_by: this.giftedBy,
      current_page: this.currentPage,
      page_count: this.pageCount,
    };
  }
}
