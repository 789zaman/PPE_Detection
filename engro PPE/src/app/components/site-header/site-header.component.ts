import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule, Bell, LogOut, ShieldCheck, Volume2 } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PpeApiService } from '../../core/api/ppe-api.service';
import { PpeHubService } from '../../core/signalr/ppe-hub.service';
import { ApiNotification } from '../../core/models/ppe.models';
import { ViolationAlarmService } from '../../services/violation-alarm.service';

@Component({
  selector: 'app-site-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <header class="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
      <div class="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div class="flex items-center gap-3">
          <img
            src="Image/engro-logo.png"
            alt="Engro Fertilizers"
            class="h-10 w-auto bg-transparent object-contain"
          />
          <div>
            <h1 class="font-display text-lg leading-tight font-bold">Engro Fertilizer</h1>
            <p class="text-xs text-muted-foreground">AI PPE Compliance Monitor · Daharki Plant</p>
          </div>
        </div>

        <nav class="flex items-center gap-1 rounded-full border border-border bg-secondary/60 p-1">
          @for (n of navItems; track n.to) {
            <a
              [routerLink]="n.to"
              routerLinkActive="bg-primary text-primary-foreground"
              [routerLinkActiveOptions]="{ exact: n.exact }"
              class="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {{ n.label }}
            </a>
          }
        </nav>

        <div class="flex flex-wrap items-center gap-3">
          @if (compliance) {
            <div class="hidden items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 sm:flex">
              <lucide-icon [img]="ShieldCheckIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
              <span class="text-sm font-semibold">Site compliance {{ compliance }}%</span>
            </div>
          }

          <label
            class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold select-none"
            [class.border-amber-500]="bypassOn"
            [class.bg-amber-100]="bypassOn"
            [class.text-amber-900]="bypassOn"
            [class.border-border]="!bypassOn"
            [class.bg-secondary]="!bypassOn"
            [attr.title]="bypassTitle"
            (click)="toggleBypass(); $event.preventDefault()"
          >
            <span>{{ bypassOn ? 'Bypass ON' : 'PPE Bypass' }}</span>
            <span
              role="switch"
              [attr.aria-checked]="bypassOn"
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
              [class.bg-amber-500]="bypassOn"
              [class.bg-slate-400]="!bypassOn"
            >
              <span
                class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                [class.translate-x-4]="bypassOn"
                [class.translate-x-1]="!bypassOn"
              ></span>
            </span>
          </label>

          <button
            type="button"
            (click)="enableSound()"
            class="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-accent"
            [class.border-destructive]="ringing"
            [class.bg-destructive]="ringing"
            [class.text-white]="ringing"
            [class.border-border]="!ringing"
            [class.bg-secondary]="!ringing"
            [class.text-secondary-foreground]="!ringing"
            [title]="ringing ? 'Violation alarm sounding' : 'Click once to allow the browser to play the violation alarm'"
          >
            <lucide-icon [img]="VolumeIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Sound
          </button>

          <div class="relative">
            <button
              type="button"
              (click)="toggleNotifications()"
              class="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground hover:bg-accent"
              aria-label="Notifications"
            >
              <lucide-icon [img]="BellIcon" class="h-4 w-4" [size]="16"></lucide-icon>
              @if (unread > 0) {
                <span
                  class="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
                >
                  {{ unread > 99 ? '99+' : unread }}
                </span>
              }
            </button>

            @if (showNotifications) {
              <div
                class="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
              >
                <div class="flex items-center justify-between border-b border-border px-3 py-2">
                  <span class="text-xs font-semibold">Notifications</span>
                  <button
                    type="button"
                    class="text-[11px] font-semibold text-primary hover:underline"
                    (click)="markAllRead()"
                  >
                    Mark all read
                  </button>
                </div>
                <div class="max-h-72 overflow-y-auto">
                  @if (!notifications.length) {
                    <p class="px-3 py-6 text-center text-xs text-muted-foreground">No notifications</p>
                  } @else {
                    @for (n of notifications; track trackNotification($index, n)) {
                      <button
                        type="button"
                        class="block w-full border-b border-border px-3 py-2.5 text-left hover:bg-accent/40"
                        [style.background]="!n.isRead ? 'color-mix(in srgb, var(--secondary) 40%, transparent)' : null"
                        (click)="markRead(n)"
                      >
                        <p class="truncate text-xs font-semibold">{{ n.title || 'PPE alert' }}</p>
                        <p class="truncate text-[11px] text-muted-foreground">
                          {{ n.message || n.body || '' }}
                        </p>
                      </button>
                    }
                  }
                </div>
              </div>
            }
          </div>

          <button
            type="button"
            (click)="logout()"
            class="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold hover:bg-accent"
          >
            <lucide-icon [img]="LogoutIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Sign out
          </button>

          <p class="text-xs font-medium tracking-wide text-muted-foreground">
            powered by <span class="font-bold text-[#1565c0]">Epsilon</span>
          </p>
        </div>
      </div>
    </header>
  `,
})
export class SiteHeaderComponent implements OnInit, OnDestroy {
  @Input() compliance?: string;
  readonly ShieldCheckIcon = ShieldCheck;
  readonly VolumeIcon = Volume2;
  readonly BellIcon = Bell;
  readonly LogoutIcon = LogOut;
  unread = 0;
  bypassOn = false;
  ringing = false;

  get bypassTitle() {
    return this.bypassOn
      ? 'PPE bypass ON — alarm, bounding boxes, alerts, and live violation updates suppressed'
      : 'Turn on PPE bypass for activity without PPE (no alarm, boxes, or alerts)';
  }

  get navItems() {
    const items = [
      { to: '/', label: 'Dashboard', exact: true },
      { to: '/cameras', label: 'Live Cameras', exact: false },
      { to: '/history', label: 'Violation History', exact: false },
    ];
    if (this.auth.canManageCameras()) {
      items.push({ to: '/settings/zones', label: 'Zones', exact: false });
      items.push({ to: '/settings/cameras', label: 'Settings', exact: false });
    }
    return items;
  }

  showNotifications = false;
  notifications: ApiNotification[] = [];
  private subs = new Subscription();

  constructor(
    private auth: AuthService,
    private api: PpeApiService,
    private hub: PpeHubService,
    private alarm: ViolationAlarmService,
  ) {}

  ngOnInit() {
    this.bypassOn = this.alarm.bypassEnabled;
    this.refreshUnread();
    this.subs.add(
      this.alarm.bypass$.subscribe((on) => {
        this.bypassOn = on;
      }),
    );
    this.subs.add(
      this.alarm.ringing$.subscribe((on) => {
        this.ringing = on;
      }),
    );
    this.subs.add(
      this.hub.notificationReceived$.subscribe((n) => {
        if (this.alarm.bypassEnabled) return;
        this.unread += 1;
        this.notifications = [n, ...this.notifications].slice(0, 20);
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  toggleBypass() {
    this.alarm.unlockAudio();
    this.alarm.toggleBypass();
  }

  enableSound() {
    this.alarm.testRing();
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.api.getNotifications(1, 20).subscribe({
        next: (page) => (this.notifications = page.items),
      });
    }
  }

  markRead(n: ApiNotification) {
    if (!n.id) return;
    this.api.markNotificationRead(n.id).subscribe({
      next: () => {
        n.isRead = true;
        this.refreshUnread();
      },
    });
  }

  markAllRead() {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
        this.unread = 0;
      },
    });
  }

  logout() {
    void this.hub.stop();
    this.auth.logout();
  }

  trackNotification(index: number, n: ApiNotification) {
    return n.id || index;
  }

  private refreshUnread() {
    this.api.getUnreadCount().subscribe({
      next: (count) => (this.unread = count),
      error: () => (this.unread = 0),
    });
  }
}
