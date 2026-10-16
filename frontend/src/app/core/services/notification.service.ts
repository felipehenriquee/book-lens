import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';

const DEFAULT_DURATION_MS = 4000;
const ACTION_DURATION_MS = 8000;

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

  /** Toast com um botão de ação (ex.: "Revisar"); o Observable emite se o usuário clicar. */
  withAction(message: string, action: string, kind: 'success' | 'error' | 'info' = 'info'): Observable<void> {
    return this.snackBar
      .open(message, action, {
        duration: ACTION_DURATION_MS,
        panelClass: `${kind}-snackbar`,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      })
      .onAction();
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
