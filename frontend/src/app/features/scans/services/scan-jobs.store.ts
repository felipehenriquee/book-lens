import { Injectable, computed, inject, signal } from '@angular/core';
import { ScanJob } from '../models/scan-job.model';
import { ScanJobService } from './scan-job.service';

/**
 * Lista de scans do usuário, compartilhada entre a tela "Meus scans", o
 * contador do header e as notificações em tempo real (que chamam upsert()).
 */
@Injectable({
  providedIn: 'root',
})
export class ScanJobsStore {
  private readonly api = inject(ScanJobService);

  readonly jobs = signal<ScanJob[]>([]);
  readonly isLoaded = signal(false);

  /** Prontos e ainda não revisados: o número no badge do header. */
  readonly readyCount = computed(() => this.jobs().filter((job) => job.status === 'DONE').length);
  /** Na fila ou sendo analisados agora. */
  readonly pendingCount = computed(() => this.jobs().filter((job) => job.isPending).length);

  refresh(): void {
    this.api.list().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.isLoaded.set(true);
      },
      error: () => this.isLoaded.set(true),
    });
  }

  /** Insere ou atualiza um job (upload novo ou evento SSE), mantendo o mais recente primeiro. */
  upsert(job: ScanJob): void {
    this.jobs.update((jobs) => {
      const others = jobs.filter((item) => item.id !== job.id);
      return [job, ...others].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    });
  }

  remove(id: string): void {
    this.jobs.update((jobs) => jobs.filter((job) => job.id !== id));
  }

  clear(): void {
    this.jobs.set([]);
    this.isLoaded.set(false);
  }
}
