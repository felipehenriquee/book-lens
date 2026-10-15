import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BookCardComponent } from '../../components/book-card/book-card.component';
import { AddBookModalComponent } from '../../components/add-book-modal/add-book-modal.component';
import { BookService } from '../../services/book.service';
import { LibraryUiService } from '../../services/library-ui.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';
import { STATUS_COLORS } from '../../../../shared/components/status-badge/status-badge.component';
import { BookFormatPipe } from '../../../../shared/pipes/book-format.pipe';
import { Book, BookFormat, ReadingStatus } from '../../models/book.model';

type SortOption =
  | 'recent'
  | 'title-asc'
  | 'title-desc'
  | 'author'
  | 'rating-desc'
  | 'rating-asc'
  | 'price-desc'
  | 'price-asc';
type StatusFilter = 'ALL' | ReadingStatus;
type FormatFilter = 'ALL' | BookFormat;
type RatedFilter = 'ALL' | 'RATED' | 'UNRATED';
const ALL = 'ALL' as const;

interface StatusChip {
  value: StatusFilter;
  label: string;
  count: number;
}

@Component({
  selector: 'app-book-list-page',
  standalone: true,
  imports: [
    RouterLink,
    BookCardComponent,
    BookCoverComponent,
    AddBookModalComponent,
    MatProgressSpinnerModule,
    BookFormatPipe,
  ],
  templateUrl: './book-list-page.component.html',
})
export class BookListPageComponent implements OnInit {
  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);
  readonly libraryUi = inject(LibraryUiService);

  readonly isLoading = signal(false);
  readonly books = signal<Book[]>([]);
  readonly isMarkingRead = signal(false);
  readonly showMoreFilters = signal(false);

  readonly formatOptions: BookFormat[] = ['PAPERBACK', 'HARDCOVER', 'EBOOK', 'POCKET'];

  readonly sortBy = signal<SortOption>('recent');
  readonly statusFilter = signal<StatusFilter>(ALL);
  readonly formatFilter = signal<FormatFilter>(ALL);
  readonly ratedFilter = signal<RatedFilter>(ALL);
  readonly readYearFilter = signal<string>(ALL);
  readonly purchaseYearFilter = signal<string>(ALL);

  readonly readYears = computed(() => this.extractYears(this.books(), (book) => book.readDate));
  readonly purchaseYears = computed(() =>
    this.extractYears(this.books(), (book) => book.purchaseDate)
  );

  readonly activeExtraFilters = computed(
    () =>
      [this.formatFilter(), this.ratedFilter(), this.readYearFilter(), this.purchaseYearFilter()].filter(
        (value) => value !== ALL
      ).length
  );

  readonly stats = computed(() => {
    const total = this.books().length;
    const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '0%');
    const read = this.countByStatus('READ');
    const reading = this.countByStatus('READING');
    const unread = this.countByStatus('UNREAD');
    return [
      { label: 'Livros na estante', value: total, pct: total ? '100%' : '0%', color: '#15171C' },
      { label: 'Lidos', value: read, pct: pct(read), color: STATUS_COLORS.READ.dot },
      { label: 'Lendo agora', value: reading, pct: pct(reading), color: STATUS_COLORS.READING.dot },
      { label: 'Não lidos', value: unread, pct: pct(unread), color: STATUS_COLORS.UNREAD.dot },
    ];
  });

  /** Pausado/Abandonado não estão no design: só aparecem quando há livros nesses status. */
  readonly statusChips = computed<StatusChip[]>(() => {
    const chips: StatusChip[] = [
      { value: ALL, label: 'Todos', count: this.books().length },
      { value: 'READ', label: 'Lidos', count: this.countByStatus('READ') },
      { value: 'READING', label: 'Lendo', count: this.countByStatus('READING') },
      { value: 'UNREAD', label: 'Não lidos', count: this.countByStatus('UNREAD') },
      { value: 'PAUSED', label: 'Pausados', count: this.countByStatus('PAUSED') },
      { value: 'ABANDONED', label: 'Abandonados', count: this.countByStatus('ABANDONED') },
    ];
    return chips.filter(
      (chip) => !['PAUSED', 'ABANDONED'].includes(chip.value) || chip.count > 0
    );
  });

  /** Livro mais recente com status "Lendo", destacado no "Continue lendo". */
  readonly currentlyReading = computed(() =>
    this.sortBooks(
      this.books().filter((book) => book.readingStatus === 'READING'),
      'recent'
    )[0]
  );

  readonly visibleBooks = computed(() => {
    let result = this.books();
    const search = this.normalize(this.libraryUi.search().trim());

    if (search) {
      result = result.filter((book) =>
        [book.title, book.author, book.publisher].some((field) =>
          this.normalize(field ?? '').includes(search)
        )
      );
    }
    if (this.statusFilter() !== ALL) {
      result = result.filter((book) => book.readingStatus === this.statusFilter());
    }
    if (this.formatFilter() !== ALL) {
      result = result.filter((book) => book.format === this.formatFilter());
    }
    if (this.ratedFilter() === 'RATED') {
      result = result.filter((book) => !!book.rating);
    } else if (this.ratedFilter() === 'UNRATED') {
      result = result.filter((book) => !book.rating);
    }
    if (this.readYearFilter() !== ALL) {
      result = result.filter((book) => book.readDate?.startsWith(this.readYearFilter()));
    }
    if (this.purchaseYearFilter() !== ALL) {
      result = result.filter((book) => book.purchaseDate?.startsWith(this.purchaseYearFilter()));
    }

    return this.sortBooks(result, this.sortBy());
  });

  ngOnInit(): void {
    this.loadBooks();
  }

  readingProgress(book: Book): number {
    if (!book.pageCount) {
      return 0;
    }
    return Math.min(100, Math.round(((book.currentPage ?? 0) / book.pageCount) * 100));
  }

  setSort(value: string): void {
    this.sortBy.set(value as SortOption);
  }

  clearFilters(): void {
    this.libraryUi.search.set('');
    this.statusFilter.set(ALL);
    this.formatFilter.set(ALL);
    this.ratedFilter.set(ALL);
    this.readYearFilter.set(ALL);
    this.purchaseYearFilter.set(ALL);
  }

  markAsRead(book: Book): void {
    this.isMarkingRead.set(true);
    const updated = Object.assign(Object.create(Object.getPrototypeOf(book)), book, {
      readingStatus: 'READ',
    }) as Book;
    this.bookService.update(book.id, updated).subscribe({
      next: (saved) => {
        this.books.update((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        this.notificationService.success(`"${saved.title}" marcado como lido.`);
        this.isMarkingRead.set(false);
      },
      error: () => this.isMarkingRead.set(false),
    });
  }

  onAddClosed(): void {
    this.libraryUi.isAddModalOpen.set(false);
  }

  onAddSaved(book: Book): void {
    this.libraryUi.isAddModalOpen.set(false);
    this.saveBooks([book]);
  }

  private countByStatus(status: ReadingStatus): number {
    return this.books().filter((book) => book.readingStatus === status).length;
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  private loadBooks(): void {
    this.isLoading.set(true);
    this.bookService.getAll().subscribe({
      next: (books) => {
        this.books.set(books);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  private saveBooks(books: Book[]): void {
    this.bookService.createMany(books).subscribe((created) => {
      this.books.update((current) => [...created, ...current]);
      this.notificationService.success(
        `${created.length} ${created.length === 1 ? 'livro adicionado' : 'livros adicionados'} à coleção.`
      );
    });
  }

  private extractYears(books: Book[], accessor: (book: Book) => string | undefined): string[] {
    const years = new Set<string>();
    for (const book of books) {
      const value = accessor(book);
      if (value) {
        years.add(value.slice(0, 4));
      }
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }

  private sortBooks(books: Book[], sortBy: SortOption): Book[] {
    const sorted = [...books];
    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
        break;
      case 'title-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        break;
      case 'title-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
        break;
      case 'author':
        sorted.sort((a, b) => a.author.localeCompare(b.author, 'pt-BR'));
        break;
      case 'rating-desc':
        sorted.sort((a, b) => this.compareNullable(a.rating, b.rating, 'desc'));
        break;
      case 'rating-asc':
        sorted.sort((a, b) => this.compareNullable(a.rating, b.rating, 'asc'));
        break;
      case 'price-desc':
        sorted.sort((a, b) => this.compareNullable(a.paidPrice, b.paidPrice, 'desc'));
        break;
      case 'price-asc':
        sorted.sort((a, b) => this.compareNullable(a.paidPrice, b.paidPrice, 'asc'));
        break;
    }
    return sorted;
  }

  /** Livros sem valor (nunca avaliados/sem preço) sempre vão para o final, nas duas direções. */
  private compareNullable(a: number | undefined, b: number | undefined, direction: 'asc' | 'desc'): number {
    if (a == null && b == null) {
      return 0;
    }
    if (a == null) {
      return 1;
    }
    if (b == null) {
      return -1;
    }
    return direction === 'asc' ? a - b : b - a;
  }
}
