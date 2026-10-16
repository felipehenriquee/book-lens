import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Espera antes de cada nova tentativa de conexão (segundos); repete o último. */
const RECONNECT_DELAYS_S = [2, 5, 10, 30];

interface RealtimeEvent {
  type: string;
  data: any;
}

/**
 * Conexão SSE com /notifications/stream, aberta enquanto o usuário está logado.
 *
 * O EventSource não envia o header Authorization, então cada conexão começa
 * pedindo um token de uso único ao backend. Como o token não serve para uma
 * segunda conexão, a reconexão automática do navegador é desligada e feita
 * aqui, sempre com um token novo.
 */
@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);

  private readonly events$ = new Subject<RealtimeEvent>();
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private active = false;

  readonly isConnected = signal(false);
  /** Emite a cada conexão estabelecida (inclusive reconexões): hora de ressincronizar o estado. */
  readonly connected$ = new Subject<void>();

  connect(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.open();
  }

  disconnect(): void {
    this.active = false;
    this.clearReconnect();
    this.closeSource();
    this.attempt = 0;
  }

  /** Eventos de um tipo (ex.: "scan_job"), com o JSON já convertido. */
  on<T = any>(type: string): Observable<T> {
    return this.events$.pipe(
      filter((event) => event.type === type),
      map((event) => event.data as T)
    );
  }

  private open(): void {
    this.http.post<{ token: string }>(`${environment.apiUrl}/notifications/stream-token`, {}).subscribe({
      next: ({ token }) => {
        if (!this.active) {
          return;
        }
        const source = new EventSource(`${environment.apiUrl}/notifications/stream?token=${encodeURIComponent(token)}`);
        this.source = source;

        source.addEventListener('ready', () => {
          this.attempt = 0;
          this.isConnected.set(true);
          this.connected$.next();
        });
        source.addEventListener('scan_job', (event) => this.emit('scan_job', event as MessageEvent));
        source.onerror = () => {
          // Queda da conexão ou token recusado: fecha (desliga a reconexão
          // automática, que reusaria o token) e tenta de novo com um token novo.
          this.closeSource();
          this.scheduleReconnect();
        };
      },
      // Sem token (ex.: sessão expirada — o interceptor já trata o 401): tenta mais tarde.
      error: () => this.scheduleReconnect(),
    });
  }

  private emit(type: string, event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      // Garante a detecção de mudanças do Angular para quem reage ao evento.
      this.zone.run(() => this.events$.next({ type, data }));
    } catch {
      // Evento malformado: ignora.
    }
  }

  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer) {
      return;
    }
    const delay = RECONNECT_DELAYS_S[Math.min(this.attempt, RECONNECT_DELAYS_S.length - 1)];
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.active) {
        this.open();
      }
    }, delay * 1000);
  }

  private closeSource(): void {
    this.source?.close();
    this.source = null;
    this.isConnected.set(false);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
