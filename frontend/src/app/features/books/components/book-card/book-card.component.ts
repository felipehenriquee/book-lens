import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Book } from '../../models/book.model';
import { BookCoverComponent } from '../../../../shared/components/book-cover/book-cover.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [RouterLink, BookCoverComponent, StatusBadgeComponent],
  templateUrl: './book-card.component.html',
})
export class BookCardComponent {
  @Input({ required: true }) book!: Book;

  get stars(): string {
    const rating = Math.round(this.book.rating ?? 0);
    return rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
  }
}
