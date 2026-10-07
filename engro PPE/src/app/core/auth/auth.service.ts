import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, Subject, catchError, map, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiEnvelope,
  AuthUser,
  HubConnectionToken,
  LoginRequest,
  RegisterRequest,
} from '../models/api.models';
import { asRecord, extractAuthSession, pickString } from '../api/mappers';

const ACCESS_KEY = 'ppe.accessToken';
const REFRESH_KEY = 'ppe.refreshToken';
const USER_KEY = 'ppe.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBaseUrl;

  constructor() {
    this.forgetStoredSession();
  }

  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly refreshTokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<AuthUser | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.accessTokenSignal());
  private readonly sessionEndedSubject = new Subject<void>();
  readonly sessionEnded$ = this.sessionEndedSubject.asObservable();
  /** Settings → Cameras (register/upsert) requires ppe:manage or Administrator / Super Admin. */
  readonly canManageCameras = computed(() => this.hasManageAccess(this.userSignal()));
  /** Destructive actions (e.g. delete camera) — Super Admin only. */
  readonly isSuperAdmin = computed(() => this.hasSuperAdminRole(this.userSignal()));

  login(payload: LoginRequest): Observable<void> {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/api/v1/auth/login`, payload).pipe(
      map((res) => {
        if (res && res.success === false) {
          throw new Error(res.message || this.firstError(res) || 'Login failed.');
        }
        return extractAuthSession(res?.data ?? res);
      }),
      tap((session) => this.persistSession(session.token, session.refreshToken, session.user)),
      map(() => void 0),
      catchError((err) => throwError(() => this.toError(err, 'Login failed.'))),
    );
  }

  register(payload: RegisterRequest): Observable<void> {
    // Bootstrap register returns a RAW AuthResponse body (no envelope) per BE contract.
    return this.http.post<unknown>(`${this.base}/api/v1/auth/register`, payload).pipe(
      map((res) => extractAuthSession(res)),
      tap((session) => this.persistSession(session.token, session.refreshToken, session.user)),
      map(() => void 0),
      catchError((err) => throwError(() => this.toError(err, 'Registration failed.'))),
    );
  }

  refresh(): Observable<string> {
    const refreshToken = this.refreshTokenSignal();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available.'));
    }

    return this.http
      .post<ApiEnvelope<unknown>>(`${this.base}/api/v1/auth/refresh`, { refreshToken })
      .pipe(
        map((res) => {
          if (res && res.success === false) {
            throw new Error(res.message || 'Token refresh failed.');
          }
          return extractAuthSession(res?.data ?? res);
        }),
        tap((session) =>
          this.persistSession(session.token, session.refreshToken ?? refreshToken, session.user),
        ),
        map((session) => session.token),
        catchError((err) => {
          this.clearSession();
          return throwError(() => this.toError(err, 'Session expired. Please sign in again.'));
        }),
      );
  }

  loadMe(): Observable<AuthUser | null> {
    if (!this.accessTokenSignal()) return of(null);
    return this.http.get<ApiEnvelope<Record<string, unknown>>>(`${this.base}/api/v1/auth/me`).pipe(
      map((res) => this.normalizeUser(res?.data ?? (res as unknown as Record<string, unknown>))),
      tap((user) => {
        this.userSignal.set(user);
      }),
      catchError(() => of(this.userSignal())),
    );
  }

  issueHubToken(): Observable<string> {
    return this.http
      .post<ApiEnvelope<HubConnectionToken | Record<string, unknown>>>(
        `${this.base}/api/v1/auth/hub-connection-token`,
        {},
      )
      .pipe(
        map((res) => {
          const data = asRecord(res?.data) ?? asRecord(res) ?? {};
          const token = pickString(data, 'accessToken', 'token', 'access_token');
          if (!token) throw new Error('Hub connection token missing.');
          return token;
        }),
      );
  }

  logout(navigate = true) {
    this.clearSession();
    this.sessionEndedSubject.next();
    if (navigate) void this.router.navigateByUrl('/login');
  }

  hasManageAccess(user: AuthUser | null = this.userSignal()): boolean {
    if (!user) return false;
    if (this.hasSuperAdminRole(user)) return true;
    const permissions = [...(user.permissions ?? [])].map((p) => p.toLowerCase());
    const roles = [...(user.roles ?? [])].map((r) => r.toLowerCase().replace(/[\s-]+/g, '_'));
    return permissions.includes('ppe:manage') || roles.includes('administrator');
  }

  hasSuperAdminRole(user: AuthUser | null = this.userSignal()): boolean {
    if (!user) return false;
    const roles = [...(user.roles ?? [])].map((r) => r.toLowerCase().replace(/[\s-]+/g, '_'));
    return roles.includes('super_admin') || roles.includes('superadmin');
  }

  private persistSession(token: string, refreshToken?: string | null, user?: AuthUser | null) {
    this.accessTokenSignal.set(token);
    if (refreshToken) this.refreshTokenSignal.set(refreshToken);
    if (user) this.userSignal.set(user);
    this.forgetStoredSession();
  }

  private clearSession() {
    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.userSignal.set(null);
    this.forgetStoredSession();
  }

  /** Drop leftover tokens so a restart always opens on the login page. */
  private forgetStoredSession() {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  private normalizeUser(raw: unknown): AuthUser {
    const obj = asRecord(raw) ?? {};
    const permissions = Array.isArray(obj['permissions'])
      ? (obj['permissions'] as string[])
      : Array.isArray(obj['actions'])
        ? (obj['actions'] as string[])
        : [];
    return {
      id: pickString(obj, 'userId', 'id') || undefined,
      fullName: pickString(obj, 'fullName') || undefined,
      email: pickString(obj, 'email') || undefined,
      roles: Array.isArray(obj['roles']) ? (obj['roles'] as string[]) : [],
      permissions,
    };
  }

  private firstError(res: ApiEnvelope<unknown>): string | undefined {
    return res.errors?.find((e) => !!e?.message)?.message ?? undefined;
  }

  private toError(err: unknown, fallback: string): Error {
    const httpErr = err as {
      error?: { message?: string; errors?: { message?: string }[]; title?: string };
      message?: string;
    };
    const envelope = httpErr?.error;
    const fromErrors = envelope?.errors?.find((e) => !!e?.message)?.message;
    return new Error(fromErrors || envelope?.message || envelope?.title || httpErr?.message || fallback);
  }
}
