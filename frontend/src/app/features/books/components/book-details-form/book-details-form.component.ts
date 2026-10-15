import { Component, Input, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { StarRatingComponent } from '../../../../shared/components/star-rating/star-rating.component';
import { MonthYearPickerComponent } from '../../../../shared/components/month-year-picker/month-year-picker.component';
import { GoogleBookInfoComponent } from '../google-book-info/google-book-info.component';
import { ReadingStatusPipe } from '../../../../shared/pipes/reading-status.pipe';
import { BookFormatPipe } from '../../../../shared/pipes/book-format.pipe';
import { BookFormat, ReadingStatus } from '../../models/book.model';
import { DetectedBook } from '../../models/ocr-scan.model';

/**
 * Corpo compartilhado de "ver/editar livro": informações vindas do Google
 * Books (somente leitura) + formulário dos dados pessoais. Usado tanto no
 * modal de detalhes do scan quanto no passo 2 do cadastro manual — quem
 * envolve isso num <app-modal-general> decide o resto (título, tamanho,
 * quando salvar).
 */
@Component({
  selector: 'app-book-details-form',
  standalone: true,
  imports: [
    StarRatingComponent,
    MonthYearPickerComponent,
    GoogleBookInfoComponent,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    ReadingStatusPipe,
    BookFormatPipe,
  ],
  templateUrl: './book-details-form.component.html',
})
export class BookDetailsFormComponent implements OnInit {
  @Input({ required: true }) book!: DetectedBook;

  private readonly formBuilder = inject(FormBuilder);

  readonly formatOptions: BookFormat[] = ['PAPERBACK', 'HARDCOVER', 'EBOOK', 'POCKET'];
  readonly statusOptions: ReadingStatus[] = ['UNREAD', 'READING', 'READ', 'PAUSED', 'ABANDONED'];

  readonly form = this.formBuilder.group({
    rating: [null as number | null, [Validators.min(1), Validators.max(5)]],
    format: [null as BookFormat | null],
    readingStatus: ['UNREAD' as ReadingStatus],
    isGifted: [false],
    paidPrice: [null as number | null, [Validators.min(0)]],
    purchaseDate: [null as string | null],
    readDate: [null as string | null],
    userNotes: [''],
  });

  constructor() {
    this.form.controls.isGifted.valueChanges.subscribe((isGifted) => {
      const paidPriceControl = this.form.controls.paidPrice;
      if (isGifted) {
        paidPriceControl.setValue(null);
        paidPriceControl.disable();
      } else {
        paidPriceControl.enable();
      }
    });
  }

  ngOnInit(): void {
    this.form.patchValue({
      rating: this.book.rating ?? null,
      format: this.book.format ?? null,
      readingStatus: this.book.readingStatus,
      isGifted: this.book.isGifted,
      paidPrice: this.book.paidPrice ?? null,
      purchaseDate: this.book.purchaseDate ?? null,
      readDate: this.book.readDate ?? null,
      userNotes: this.book.userNotes ?? '',
    });
  }

  get purchaseDateLabel(): string {
    return this.form.controls.isGifted.value ? 'Data do presente' : 'Data de compra';
  }

  get isRead(): boolean {
    return this.form.controls.readingStatus.value === 'READ';
  }

  get isValid(): boolean {
    return this.form.valid;
  }

  /** Chamado pelo componente pai quando o usuário confirma. Retorna null se o formulário estiver inválido. */
  getUpdatedBook(): DetectedBook | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }

    const raw = this.form.getRawValue();
    return new DetectedBook(
      this.book.title,
      this.book.authors,
      this.book.publisher,
      this.book.confidence,
      this.book.googleBooksId,
      this.book.coverUrl,
      this.book.previewLink,
      this.book.description,
      this.book.publishedDate,
      this.book.pageCount,
      this.book.categories,
      this.book.averageRating,
      this.book.isbn13,
      this.book.listPriceAmount,
      this.book.listPriceCurrency,
      raw.format || undefined,
      raw.readingStatus || 'UNREAD',
      raw.rating || undefined,
      raw.purchaseDate || undefined,
      raw.isGifted ?? false,
      raw.paidPrice || undefined,
      raw.readDate || undefined,
      raw.userNotes || undefined
    );
  }
}
