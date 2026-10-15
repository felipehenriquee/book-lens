import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/** Injects the JWT Bearer token into outgoing requests targeting our API. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  const isApiRequest = req.url.startsWith(environment.apiUrl);
  if (!token || !isApiRequest) {
    return next(req);
  }

  const authorizedRequest = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authorizedRequest);
};
