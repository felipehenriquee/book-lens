import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BookCardComponent } from '../../components/book-card/book-card.component';
import { ScanDialogComponent } from '../../components/scan-dialog/scan-dialog.component';
import { AddBookModalComponent } from '../../components/add-book-modal/add-book-modal.component';
import { BookService } from '../../services/book.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ReadingStatusPipe } from '../../../../shared/pipes/reading-status.pipe';
import { BookFormatPipe } from '../../../../shared/pipes/book-format.pipe';
import { Book, BookFormat, ReadingStatus } from '../../models/book.model';

type SortOption = 'title-asc' | 'title-desc' | 'rating-asc' | 'rating-desc' | 'price-asc' | 'price-desc';
type StatusFilter = 'ALL' | ReadingStatus;
type FormatFilter = 'ALL' | BookFormat;
type RatedFilter = 'ALL' | 'RATED' | 'UNRATED';
const ALL = 'ALL' as const;

@Component({
  selector: 'app-book-list-page',
  standalone: true,
  imports: [
    BookCardComponent,
    ScanDialogComponent,
    AddBookModalComponent,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    ReadingStatusPipe,
    BookFormatPipe,
  ],
  templateUrl: './book-list-page.component.html',
})
export class BookListPageComponent implements OnInit {
  private readonly bookService = inject(BookService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly isLoading = signal(false);
  readonly books = signal<Book[]>([]);
  readonly isScanModalOpen = signal(false);
  readonly isAddModalOpen = signal(false);

  readonly formatOptions: BookFormat[] = ['PAPERBACK', 'HARDCOVER', 'EBOOK', 'POCKET'];
  readonly statusOptions: ReadingStatus[] = ['UNREAD', 'READING', 'READ', 'PAUSED', 'ABANDONED'];

  readonly sortBy = signal<SortOption>('title-asc');
  readonly statusFilter = signal<StatusFilter>(ALL);
  readonly formatFilter = signal<FormatFilter>(ALL);
  readonly ratedFilter = signal<RatedFilter>(ALL);
  readonly readYearFilter = signal<string>(ALL);
  readonly purchaseYearFilter = signal<string>(ALL);

  readonly readYears = computed(() => this.extractYears(this.books(), (book) => book.readDate));
  readonly purchaseYears = computed(() =>
    this.extractYears(this.books(), (book) => book.purchaseDate)
  );

  readonly visibleBooks = computed(() => {
    let result = this.books();

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

  openScanModal(): void {
    this.isScanModalOpen.set(true);
  }

  openAddModal(): void {
    this.isAddModalOpen.set(true);
  }

  onScanClosed(): void {
    this.isScanModalOpen.set(false);
  }

  onScanSaved(books: Book[]): void {
    this.isScanModalOpen.set(false);
    if (books.length > 0) {
      this.saveBooks(books);
    }
  }

  onAddClosed(): void {
    this.isAddModalOpen.set(false);
  }

  onAddSaved(book: Book): void {
    this.isAddModalOpen.set(false);
    this.saveBooks([book]);
  }

  onDeleteRequested(bookId: string): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remover livro',
        message: 'Tem certeza que deseja remover este livro da sua coleção?',
        confirmText: 'Remover',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.bookService.delete(bookId).subscribe(() => {
        this.books.update((current) => current.filter((book) => book.id !== bookId));
        this.notificationService.success('Livro removido da coleção.');
      });
    });
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
      case 'title-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        break;
      case 'title-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
        break;
      case 'rating-asc':
        sorted.sort((a, b) => this.compareNullable(a.rating, b.rating, 'asc'));
        break;
      case 'rating-desc':
        sorted.sort((a, b) => this.compareNullable(a.rating, b.rating, 'desc'));
        break;
      case 'price-asc':
        sorted.sort((a, b) => this.compareNullable(a.paidPrice, b.paidPrice, 'asc'));
        break;
      case 'price-desc':
        sorted.sort((a, b) => this.compareNullable(a.paidPrice, b.paidPrice, 'desc'));
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
