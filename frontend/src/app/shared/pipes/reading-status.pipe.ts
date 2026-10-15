import { Pipe, PipeTransform } from '@angular/core';
import { ReadingStatus } from '../../features/books/models/book.model';

const LABELS: Record<ReadingStatus, string> = {
  UNREAD: 'Não lido',
  READING: 'Lendo',
  READ: 'Lido',
  PAUSED: 'Pausado',
  ABANDONED: 'Abandonado',
};

@Pipe({
  name: 'readingStatus',
  standalone: true,
})
export class ReadingStatusPipe implements PipeTransform {
  transform(value: ReadingStatus): string {
    return LABELS[value] ?? value;
  }
}
