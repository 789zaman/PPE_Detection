import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, Lock, Mail, User } from 'lucide-angular';
import { AuthService } from '../../core/auth/auth.service';
import { PpeHubService } from '../../core/signalr/ppe-hub.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    <main class="flex min-h-screen items-center justify-center px-4 py-10">
      <div class="surface-card animate-rise w-full max-w-md p-8">
        <div class="mb-8 flex flex-col items-center text-center">
          <img src="Image/engro-logo.png" alt="Engro Fertilizers" class="mb-4 h-12 w-auto object-contain" />
          <h1 class="font-display text-2xl font-bold">Register Super Admin</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Create the first Super Admin account for the PPE Safety Monitor
          </p>
        </div>

        <form class="space-y-4" (ngSubmit)="submit()" #f="ngForm">
          <label class="block space-y-1.5 text-sm font-medium">
            Full name
            <div class="relative">
              <lucide-icon [img]="UserIcon" class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" [size]="16"></lucide-icon>
              <input
                name="fullName"
                type="text"
                required
                [(ngModel)]="fullName"
                class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="PPE Administrator"
              />
            </div>
          </label>

          <label class="block space-y-1.5 text-sm font-medium">
            Email
            <div class="relative">
              <lucide-icon [img]="MailIcon" class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" [size]="16"></lucide-icon>
              <input
                name="email"
                type="email"
                required
                [(ngModel)]="email"
                autocomplete="username"
                class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="admin@engro.com"
              />
            </div>
          </label>

          <label class="block space-y-1.5 text-sm font-medium">
            Password
            <div class="relative">
              <lucide-icon [img]="LockIcon" class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" [size]="16"></lucide-icon>
              <input
                name="password"
                type="password"
                required
                minlength="8"
                [(ngModel)]="password"
                autocomplete="new-password"
                class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Min. 8 characters"
              />
            </div>
          </label>

          <label class="block space-y-1.5 text-sm font-medium">
            Confirm password
            <div class="relative">
              <lucide-icon [img]="LockIcon" class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" [size]="16"></lucide-icon>
              <input
                name="confirmPassword"
                type="password"
                required
                [(ngModel)]="confirmPassword"
                autocomplete="new-password"
                class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Repeat password"
              />
            </div>
          </label>

          @if (error) {
            <p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>
          }

          <button
            type="submit"
            [disabled]="loading || f.invalid"
            class="gradient-primary inline-flex h-11 w-full items-center justify-center rounded-md border-0 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {{ loading ? 'Creating…' : 'Register Super Admin' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?
          <a routerLink="/login" class="font-semibold text-primary hover:underline">Sign in</a>
        </p>
      </div>
    </main>
  `,
})
export class RegisterComponent implements OnInit {
  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  readonly UserIcon = User;
  readonly MailIcon = Mail;
  readonly LockIcon = Lock;

  constructor(
    private auth: AuthService,
    private hub: PpeHubService,
    private router: Router,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    document.title = 'Register Super Admin | Engro Fertilizer PPE Monitor';
  }

  submit() {
    if (this.loading) return;
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.auth
      .register({
        fullName: this.fullName.trim(),
        email: this.email.trim(),
        password: this.password,
        confirmPassword: this.confirmPassword,
      })
      .subscribe({
        next: () => {
          this.auth.loadMe().subscribe();
          void this.hub.start();
          this.toast.success('Admin account created');
          void this.router.navigateByUrl('/');
        },
        error: (err: Error) => {
          this.error = err.message || 'Registration failed.';
          this.loading = false;
        },
        complete: () => {
          this.loading = false;
        },
      });
  }
}
