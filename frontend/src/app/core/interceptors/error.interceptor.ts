import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

/** Global HTTP error handler: shows a snackbar and reacts to 401/403/5xx. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const detail = error.error?.detail;

      switch (error.status) {
        case 401:
          authService.logout();
          notificationService.error('Sessão expirada. Faça login novamente.');
          router.navigate(['/login']);
          break;
        case 403:
          notificationService.error('Você não tem permissão para realizar esta ação.');
          break;
        case 413:
        case 415:
          notificationService.error(detail ?? 'Arquivo inválido para upload.');
          break;
        case 429:
          notificationService.error('Muitas requisições. Aguarde um instante e tente novamente.');
          break;
        case 0:
          notificationService.error('Não foi possível conectar ao servidor.');
          break;
        default:
          notificationService.error(detail ?? 'Ocorreu um erro inesperado. Tente novamente.');
      }

      return throwError(() => error);
    })
  );
};
