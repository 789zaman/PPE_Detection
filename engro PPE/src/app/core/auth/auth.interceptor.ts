import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

let refreshInFlight: Observable<string> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isApi = environment.apiBaseUrl
    ? req.url.startsWith(environment.apiBaseUrl)
    : req.url.startsWith('/api/') || req.url.startsWith('/hubs/');
  const isAuthAnonymous =
    req.url.includes('/api/v1/auth/login') ||
    req.url.includes('/api/v1/auth/register') ||
    req.url.includes('/api/v1/auth/refresh');

  const token = auth.accessToken();
  const authReq =
    isApi && token && !isAuthAnonymous
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !isApi || isAuthAnonymous) {
        return throwError(() => err);
      }

      if (!refreshInFlight) {
        refreshInFlight = auth.refresh().pipe(
          catchError((refreshErr) => {
            refreshInFlight = null;
            auth.logout();
            return throwError(() => refreshErr);
          }),
          shareReplay(1),
        );
      }

      return refreshInFlight.pipe(
        switchMap((newToken) => {
          refreshInFlight = null;
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            }),
          );
        }),
      );
    }),
  );
};
