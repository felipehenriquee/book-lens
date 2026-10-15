import { Component, Input } from '@angular/core';
import { ReadingStatus } from '../../../features/books/models/book.model';
import { ReadingStatusPipe } from '../../pipes/reading-status.pipe';

// Lido / Lendo / Não lido seguem o DESIGN.md; Pausado e Abandonado não estão
// no design e usam tons derivados da paleta (primary-soft e danger).
export const STATUS_COLORS: Record<ReadingStatus, { bg: string; fg: string; dot: string }> = {
  READ: { bg: '#E3F3EA', fg: '#17603C', dot: '#2E9E64' },
  READING: { bg: '#FFF1D6', fg: '#7A4F00', dot: '#E0A100' },
  UNREAD: { bg: '#EEEFF1', fg: '#3F444D', dot: '#8A8F99' },
  PAUSED: { bg: '#ECEEFC', fg: '#2A3BB0', dot: '#3A4FD9' },
  ABANDONED: { bg: '#FBEAE9', fg: '#B42318', dot: '#B42318' },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [ReadingStatusPipe],
  template: `
    <span
      class="inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      [style.background]="colors.bg"
      [style.color]="colors.fg"
    >{{ status | readingStatus }}</span>
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: ReadingStatus;

  get colors() {
    return STATUS_COLORS[this.status] ?? STATUS_COLORS.UNREAD;
  }
}
