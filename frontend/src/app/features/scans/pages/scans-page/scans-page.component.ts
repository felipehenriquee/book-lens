import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { NotificationService } from '../../../../core/services/notification.service';
import { RejectedFile, ScanJob } from '../../models/scan-job.model';
import { ScanJobService } from '../../services/scan-job.service';
import { ScanJobsStore } from '../../services/scan-jobs.store';
import { ScanNotificationsService } from '../../services/scan-notifications.service';

const MAX_FILES_PER_UPLOAD = 10;

/** "Meus scans": envio de várias fotos para a fila e acompanhamento de cada uma. */
@Component({
  selector: 'app-scans-page',
  standalone: true,
  imports: [RouterLink, MatProgressSpinnerModule],
  templateUrl: './scans-page.component.html',
})
export class ScansPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ScanJobService);
  private readonly notificationService = inject(NotificationService);
  private readonly scanNotifications = inject(ScanNotificationsService);
  readonly store = inject(ScanJobsStore);

  readonly acceptedTypes = environment.allowedImageTypes.join(',');
  readonly maxFiles = MAX_FILES_PER_UPLOAD;

  readonly isUploading = signal(false);
  readonly isDragging = signal(false);
  readonly rejected = signal<RejectedFile[]>([]);
  /** Object URLs das miniaturas já baixadas, por id do job. */
  readonly thumbnails = signal<Record<string, string>>({});

  private readonly loadingThumbnails = new Set<string>();

  constructor() {
    // Baixa a miniatura de cada job novo que aparecer na lista (upload ou evento SSE).
    effect(() => {
      for (const job of this.store.jobs()) {
        if (job.hasThumbnail && !this.thumbnails()[job.id] && !this.loadingThumbnails.has(job.id)) {
          this.loadThumbnail(job.id);
        }
      }
    });
  }

  ngOnInit(): void {
    this.store.refresh();
  }

  ngOnDestroy(): void {
    Object.values(this.thumbnails()).forEach((url) => URL.revokeObjectURL(url));
  }

  statusLabel(job: ScanJob): string {
    switch (job.status) {
      case 'QUEUED':
        return 'Na fila';
      case 'PROCESSING':
        return 'Analisando…';
      case 'DONE':
        return job.bookCount === 1 ? '1 livro encontrado' : `${job.bookCount ?? 0} livros encontrados`;
      case 'FAILED':
        return 'Falhou';
    }
  }

  statusClasses(job: ScanJob): string {
    switch (job.status) {
      case 'DONE':
        return 'bg-[#E3F3EA] text-[#17603C]';
      case 'FAILED':
        return 'bg-[#FBEAE9] text-danger';
      case 'PROCESSING':
        return 'bg-primary-soft text-primary-hover';
      default:
        return 'bg-track text-[#3F444D]';
    }
  }

  timeAgo(date: Date): string {
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.upload(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  retry(job: ScanJob): void {
    this.api.retry(job.id).subscribe((updated) => this.store.upsert(updated));
  }

  remove(job: ScanJob): void {
    this.api.delete(job.id).subscribe(() => {
      this.store.remove(job.id);
      const url = this.thumbnails()[job.id];
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }

  private upload(files: File[]): void {
    if (files.length === 0) {
      return;
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      this.notificationService.error(`Envie no máximo ${MAX_FILES_PER_UPLOAD} fotos por vez.`);
      return;
    }

    // O navegador só permite pedir a permissão em resposta a um clique: aproveita o envio.
    this.scanNotifications.requestSystemPermission();
    this.isUploading.set(true);
    this.rejected.set([]);
    this.api
      .upload(files)
      .pipe(finalize(() => this.isUploading.set(false)))
      .subscribe({
        next: ({ jobs, rejected }) => {
          jobs.forEach((job) => this.store.upsert(job));
          this.rejected.set(rejected);
          const count = jobs.length;
          this.notificationService.success(
            `${count} ${count === 1 ? 'foto enviada' : 'fotos enviadas'}. Avisaremos quando ${count === 1 ? 'ficar pronta' : 'ficarem prontas'}.`
          );
        },
        // 422 = nenhuma foto aceita: o interceptor já mostra os motivos.
      });
  }

  private loadThumbnail(id: string): void {
    this.loadingThumbnails.add(id);
    this.api
      .thumbnailUrl(id)
      .pipe(finalize(() => this.loadingThumbnails.delete(id)))
      .subscribe((url) => this.thumbnails.update((map) => ({ ...map, [id]: url })));
  }
}
