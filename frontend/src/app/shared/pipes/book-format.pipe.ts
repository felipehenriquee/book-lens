import { Pipe, PipeTransform } from '@angular/core';
import { BookFormat } from '../../features/books/models/book.model';

const LABELS: Record<BookFormat, string> = {
  PAPERBACK: 'Brochura',
  HARDCOVER: 'Capa Dura',
  EBOOK: 'E-book',
  POCKET: 'Livro de Bolso',
};

@Pipe({
  name: 'bookFormat',
  standalone: true,
})
export class BookFormatPipe implements PipeTransform {
  transform(value: BookFormat | null | undefined): string {
    if (!value) {
      return '';
    }
    return LABELS[value] ?? value;
  }
}
