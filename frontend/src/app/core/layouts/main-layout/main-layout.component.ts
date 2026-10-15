import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../services/auth.service';

// Mesmo ponto de quebra do "lg" do Tailwind: abaixo disso vira menu hambúrguer.
const TABLET_BREAKPOINT = '(max-width: 1024px)';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private breakpointSubscription?: Subscription;

  readonly isMobile = signal(false);
  readonly sidenavOpened = signal(true);

  ngOnInit(): void {
    this.breakpointSubscription = this.breakpointObserver
      .observe(TABLET_BREAKPOINT)
      .subscribe(({ matches }) => {
        this.isMobile.set(matches);
        // Ao cruzar o breakpoint, ajusta o estado padrão: aberto fixo no
        // desktop, fechado por cima (overlay) no tablet/mobile.
        this.sidenavOpened.set(!matches);
      });
  }

  ngOnDestroy(): void {
    this.breakpointSubscription?.unsubscribe();
  }

  toggleSidenav(): void {
    this.sidenavOpened.update((opened) => !opened);
  }

  closeSidenavOnMobileNav(): void {
    if (this.isMobile()) {
      this.sidenavOpened.set(false);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
