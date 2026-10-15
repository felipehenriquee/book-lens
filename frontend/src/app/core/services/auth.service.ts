import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

const TOKEN_STORAGE_KEY = 'booklens_access_token';

interface RegisterPayload {
  email: string;
  password: string;
  full_name?: string;
  birth_date: string;
}

interface JwtPayload {
  sub: string;
  exp: number;
  birth_date?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  /** Estado reativo de autenticação, consumido pelos guards e pela UI (navbar, etc). */
  readonly isAuthenticated = signal<boolean>(this.hasValidToken());

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<any>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      map((json) => AuthResponse.fromJson(json)),
      tap((auth) => this.setSession(auth))
    );
  }

  register(payload: RegisterPayload): Observable<User> {
    return this.http
      .post<any>(`${environment.apiUrl}/auth/register`, payload)
      .pipe(map((json) => User.fromJson(json)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    this.isAuthenticated.set(false);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  getCurrentUserId(): string | null {
    return this.decodeToken()?.sub ?? null;
  }

  /** Ano de nascimento do usuário, extraído do token — usado como início dos seletores de data. */
  getBirthYear(): number | null {
    const birthDate = this.decodeToken()?.birth_date;
    if (!birthDate) {
      return null;
    }
    const year = Number(birthDate.slice(0, 4));
    return Number.isFinite(year) ? year : null;
  }

  private setSession(auth: AuthResponse): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.accessToken);
    this.isAuthenticated.set(true);
  }

  private hasValidToken(): boolean {
    const payload = this.decodeToken();
    return !!payload && payload.exp * 1000 > Date.now();
  }

  private decodeToken(): JwtPayload | null {
    const token = this.getToken();
    if (!token) {
      return null;
    }
    try {
      const [, payloadSegment] = token.split('.');
      return JSON.parse(atob(payloadSegment)) as JwtPayload;
    } catch {
      return null;
    }
  }
}
