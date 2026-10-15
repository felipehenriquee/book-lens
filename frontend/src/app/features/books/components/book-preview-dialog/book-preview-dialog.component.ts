import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ModalGeneralComponent } from '../../../../shared/components/modal-general/modal-general.component';
import { BookDetailsFormComponent } from '../book-details-form/book-details-form.component';
import { DetectedBook } from '../../models/ocr-scan.model';

@Component({
  selector: 'app-book-preview-dialog',
  standalone: true,
  imports: [ModalGeneralComponent, BookDetailsFormComponent],
  templateUrl: './book-preview-dialog.component.html',
})
export class BookPreviewDialogComponent {
  @Input({ required: true }) book!: DetectedBook;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<DetectedBook>();

  @ViewChild(BookDetailsFormComponent) detailsForm!: BookDetailsFormComponent;

  close(): void {
    this.closed.emit();
  }

  save(): void {
    const updated = this.detailsForm.getUpdatedBook();
    if (updated) {
      this.saved.emit(updated);
    }
  }
}
