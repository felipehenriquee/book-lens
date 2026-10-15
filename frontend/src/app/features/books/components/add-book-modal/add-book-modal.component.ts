import { Component, EventEmitter, Output, ViewChild, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { ModalGeneralComponent } from '../../../../shared/components/modal-general/modal-general.component';
import { BookDetailsFormComponent } from '../book-details-form/book-details-form.component';
import { BookService } from '../../services/book.service';
import { Book } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';

const MIN_QUERY_LENGTH = 2;

@Component({
  selector: 'app-add-book-modal',
  standalone: true,
  imports: [
    ModalGeneralComponent,
    BookDetailsFormComponent,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './add-book-modal.component.html',
})
export class AddBookModalComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Book>();

  @ViewChild(BookDetailsFormComponent) detailsForm?: BookDetailsFormComponent;

  private readonly bookService = inject(BookService);

  readonly step = signal<1 | 2>(1);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchResults = signal<DetectedBook[]>([]);
  readonly isSearching = signal(false);
  readonly hasSearched = signal(false);
  readonly selectedBook = signal<DetectedBook | null>(null);

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => this.hasSearched.set(false)),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < MIN_QUERY_LENGTH) {
            this.isSearching.set(false);
            return of<DetectedBook[]>([]);
          }
          this.isSearching.set(true);
          return this.bookService.searchGoogleBooks(trimmed);
        })
      )
      .subscribe((results) => {
        this.searchResults.set(results);
        this.isSearching.set(false);
        this.hasSearched.set(true);
      });
  }

  get modalTitle(): string {
    return this.step() === 1 ? 'Adicionar livro na biblioteca' : (this.selectedBook()?.title ?? '');
  }

  get showNoResults(): boolean {
    return (
      this.hasSearched() &&
      !this.isSearching() &&
      this.searchResults().length === 0 &&
      this.searchControl.value.trim().length >= MIN_QUERY_LENGTH
    );
  }

  selectBook(book: DetectedBook): void {
    this.selectedBook.set(book);
    this.step.set(2);
  }

  backToSearch(): void {
    this.step.set(1);
    this.selectedBook.set(null);
  }

  close(): void {
    this.closed.emit();
  }

  save(): void {
    if (!this.detailsForm) {
      return;
    }
    const detected = this.detailsForm.getUpdatedBook();
    if (!detected) {
      return;
    }

    const book = new Book(
      '',
      detected.title,
      detected.authors.join(', ') || 'Autor desconhecido',
      detected.publisher,
      detected.coverUrl,
      detected.googleBooksId,
      detected.format,
      detected.readingStatus,
      detected.rating,
      detected.purchaseDate,
      detected.isGifted,
      detected.paidPrice,
      detected.readDate,
      detected.userNotes
    );
    book.pageCount = detected.pageCount;
    this.saved.emit(book);
  }
}
