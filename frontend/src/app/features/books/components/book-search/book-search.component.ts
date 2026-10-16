import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap, tap } from 'rxjs';
import { BookService } from '../../services/book.service';
import { DetectedBook } from '../../models/ocr-scan.model';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';

const MIN_QUERY_LENGTH = 2;

/** Busca de livros no Google Books enquanto digita; emite o resultado escolhido. */
@Component({
  selector: 'app-book-search',
  standalone: true,
  imports: [ReactiveFormsModule, MatProgressSpinnerModule, BookCoverComponent],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2 h-11 px-3 box-border border border-solid border-line-input rounded-[10px] bg-surface focus-within:border-primary focus-within:shadow-[0_0_0_3px_#ECEEFC]">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B606B" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        <input
          #searchInput
          type="search"
          [formControl]="query"
          [attr.aria-label]="placeholder"
          [placeholder]="placeholder"
          class="flex-1 min-w-0 border-0 outline-none bg-transparent font-[inherit] text-sm text-ink"
        />
        @if (isSearching()) {
          <mat-spinner diameter="18"></mat-spinner>
        }
      </div>

      @if (results().length > 0) {
        <ul class="list-none m-0 p-0 flex flex-col gap-1 max-h-80 overflow-y-auto" role="listbox" [attr.aria-label]="'Resultados da busca'">
          @for (result of results(); track $index) {
            <li>
              <button
                type="button"
                role="option"
                (click)="selected.emit(result)"
                class="w-full flex items-center gap-3 p-2 rounded-[10px] border-0 bg-transparent hover:bg-surface-muted text-left font-[inherit] cursor-pointer"
              >
                <div class="w-9 flex-none">
                  <app-book-cover [title]="result.title" [coverUrl]="result.coverUrl" [showText]="false"></app-book-cover>
                </div>
                <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span class="text-sm font-semibold text-ink truncate">{{ result.title }}</span>
                  <span class="text-xs text-muted truncate">{{ result.authors.join(', ') || 'Autor desconhecido' }}</span>
                  @if (result.publisher || result.publishedDate) {
                    <span class="text-xs text-muted truncate">
                      {{ result.publisher || '' }}{{ result.publisher && result.publishedDate ? ' · ' : '' }}{{ result.publishedDate?.slice(0, 4) || '' }}
                    </span>
                  }
                </span>
              </button>
            </li>
          }
        </ul>
      } @else if (hasSearched() && !isSearching() && query.value.trim().length >= minLength) {
        <p class="m-0 px-1 text-[13px] text-muted">Nenhum livro encontrado. Tente só o título, ou título e autor.</p>
      }
    </div>
  `,
})
export class BookSearchComponent implements OnInit {
  private readonly bookService = inject(BookService);

  /** Texto inicial da busca (ex.: o título detectado no scan). */
  @Input() initialQuery = '';
  @Input() placeholder = 'Buscar pelo título do livro';
  @Input() autofocus = false;
  @Output() selected = new EventEmitter<DetectedBook>();

  @ViewChild('searchInput', { static: true }) searchInput!: ElementRef<HTMLInputElement>;

  readonly minLength = MIN_QUERY_LENGTH;
  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<DetectedBook[]>([]);
  readonly isSearching = signal(false);
  readonly hasSearched = signal(false);

  ngOnInit(): void {
    this.query.setValue(this.initialQuery, { emitEvent: false });
    this.query.valueChanges
      .pipe(
        startWith(this.initialQuery),
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => this.hasSearched.set(false)),
        switchMap((value) => {
          const trimmed = value.trim();
          if (trimmed.length < MIN_QUERY_LENGTH) {
            this.isSearching.set(false);
            return of<DetectedBook[]>([]);
          }
          this.isSearching.set(true);
          // Erro numa busca não pode encerrar o stream (as próximas buscas parariam).
          return this.bookService.searchGoogleBooks(trimmed).pipe(catchError(() => of<DetectedBook[]>([])));
        })
      )
      .subscribe((results) => {
        this.results.set(results);
        this.isSearching.set(false);
        this.hasSearched.set(true);
      });

    if (this.autofocus) {
      // Seleciona o texto: o usuário pode só digitar por cima do título detectado.
      queueMicrotask(() => this.searchInput.nativeElement.select());
    }
  }
}
