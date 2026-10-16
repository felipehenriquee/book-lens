import { Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { RealtimeService } from './core/services/realtime.service';
import { ScanNotificationsService } from './features/scans/services/scan-notifications.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly scanNotifications = inject(ScanNotificationsService);

  constructor() {
    // Notificações em tempo real só existem com o usuário logado: conecta no
    // login (ou ao abrir o app já logado) e desconecta no logout.
    effect(() => {
      const loggedIn = this.authService.isAuthenticated();
      untracked(() => {
        if (loggedIn) {
          this.scanNotifications.start();
          this.realtime.connect();
        } else {
          this.realtime.disconnect();
          this.scanNotifications.stop();
        }
      });
    });
  }
}
