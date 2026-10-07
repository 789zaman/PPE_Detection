import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToastService } from './services/toast.service';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { AuthService } from './core/auth/auth.service';
import { PpeHubService } from './core/signalr/ppe-hub.service';
import { ViolationAlarmService } from './services/violation-alarm.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SplashScreenComponent],
  template: `
    @if (showSplash) {
      <app-splash-screen (done)="showSplash = false" />
    }

    <div [class.app-blur]="showSplash">
      <router-outlet />
    </div>

    <div class="toast-stack">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast-item" [class.success]="t.type === 'success'">
          <div class="toast-title">{{ t.title }}</div>
          @if (t.description) {
            <div class="toast-desc">{{ t.description }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .app-blur {
        filter: blur(2px);
        pointer-events: none;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  showSplash = false;

  constructor(
    public toast: ToastService,
    private auth: AuthService,
    private hub: PpeHubService,
    private alarm: ViolationAlarmService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      const authPage = e.urlAfterRedirects.startsWith('/login') || e.urlAfterRedirects.startsWith('/register');
      if (authPage) this.showSplash = false;
    });

    if (this.auth.isAuthenticated()) {
      this.showSplash = true;
      this.auth.loadMe().subscribe();
      void this.hub.start();
    }
  }
}
