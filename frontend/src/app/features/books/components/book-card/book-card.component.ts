import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Book } from '../../models/book.model';
import { ReadingStatusPipe } from '../../../../shared/pipes/reading-status.pipe';
import { StarRatingComponent } from '../../../../shared/components/star-rating/star-rating.component';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, ReadingStatusPipe, StarRatingComponent],
  templateUrl: './book-card.component.html',
})
export class BookCardComponent {
  @Input({ required: true }) book!: Book;
  @Output() deleteRequested = new EventEmitter<string>();

  get statusBadgeClass(): string {
    switch (this.book.readingStatus) {
      case 'READ':
        return 'badge-read';
      case 'READING':
        return 'badge-reading';
      default:
        return 'badge-unread';
    }
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.deleteRequested.emit(this.book.id);
  }
}
