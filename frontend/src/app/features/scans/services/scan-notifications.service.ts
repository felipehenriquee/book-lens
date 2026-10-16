import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { ScanJob } from '../models/scan-job.model';
import { ScanJobsStore } from './scan-jobs.store';

/**
 * Reage aos eventos "scan_job" do stream: atualiza a lista de scans e avisa o
 * usuário quando uma foto fica pronta (toast no app e, com a aba em segundo
 * plano, notificação do sistema).
 */
@Injectable({
  providedIn: 'root',
})
export class ScanNotificationsService {
  private readonly realtime = inject(RealtimeService);
  private readonly store = inject(ScanJobsStore);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  private subscriptions: Subscription[] = [];

  start(): void {
    if (this.subscriptions.length > 0) {
      return;
    }
    this.subscriptions = [
      // A cada (re)conexão, recarrega a lista: cobre eventos perdidos enquanto
      // o usuário estava deslogado ou sem conexão.
      this.realtime.connected$.subscribe(() => this.store.refresh()),
      this.realtime.on('scan_job').subscribe((json) => this.handle(ScanJob.fromJson(json))),
    ];
  }

  stop(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = [];
    this.store.clear();
  }

  /** Pede permissão para notificações do sistema (deve ser chamado num clique do usuário). */
  requestSystemPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private handle(job: ScanJob): void {
    this.store.upsert(job);

    const name = job.originalFilename || 'Sua foto';
    if (job.status === 'DONE') {
      const found = job.bookCount === 1 ? '1 livro encontrado' : `${job.bookCount ?? 0} livros encontrados`;
      const message = `${name}: ${found}.`;
      this.notifications
        .withAction(message, 'Revisar', 'success')
        .subscribe(() => this.router.navigate(['/app/escanear', job.id]));
      this.systemNotification('Scan pronto', message, job.id);
    } else if (job.status === 'FAILED') {
      const message = `${name}: ${job.errorMessage || 'não foi possível analisar.'}`;
      this.notifications
        .withAction(message, 'Ver', 'error')
        .subscribe(() => this.router.navigate(['/app/escanear']));
      this.systemNotification('Scan com problema', message);
    }
  }

  /** Notificação do sistema operacional, só quando o usuário não está olhando o app. */
  private systemNotification(title: string, body: string, jobId?: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') {
      return;
    }
    const notification = new Notification(title, { body, tag: jobId, icon: '/favicon.ico' });
    notification.onclick = () => {
      window.focus();
      this.router.navigate(jobId ? ['/app/escanear', jobId] : ['/app/escanear']);
      notification.close();
    };
  }
}
