import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const DEFAULT_DURATION_MS = 4000;

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor(private snackBar: MatSnackBar) {}

  success(message: string): void {
    this.show(message, 'success-snackbar');
  }

  error(message: string): void {
    this.show(message, 'error-snackbar');
  }

  info(message: string): void {
    this.show(message, 'info-snackbar');
  }

  private show(message: string, panelClass: string): void {
    this.snackBar.open(message, 'Fechar', {
      duration: DEFAULT_DURATION_MS,
      panelClass,
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
  }
}
