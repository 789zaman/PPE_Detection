import { Component, OnDestroy, OnInit } from '@angular/core';
import { LucideAngularModule, Trash2 } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { CameraTileComponent, CameraInfo } from '../../components/camera-tile/camera-tile.component';
import { PpeApiService } from '../../core/api/ppe-api.service';
import { PpeHubService } from '../../core/signalr/ppe-hub.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-cameras',
  standalone: true,
  imports: [SiteHeaderComponent, CameraTileComponent, LucideAngularModule],
  template: `
    <main class="min-h-screen bg-transparent">
      <app-site-header></app-site-header>
      <div class="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        <section class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-display text-2xl font-bold">Live Camera Wall</h2>
            <p class="text-sm text-muted-foreground">
              Plant cameras · AI PPE detection running on every feed
              @if (isSuperAdmin) {
                <span class="text-muted-foreground"> · Super Admin can delete cameras</span>
              }
            </p>
          </div>
          <div class="flex gap-2 text-xs font-semibold">
            <span class="rounded-full bg-primary/10 px-3 py-1.5 text-primary">{{ online }} online</span>
            <span class="rounded-full bg-secondary px-3 py-1.5 text-secondary-foreground">
              {{ cameras.length - online }} offline
            </span>
          </div>
        </section>

        @if (loading) {
          <p class="text-sm text-muted-foreground">Loading cameras…</p>
        } @else if (error) {
          <div class="surface-card p-4 text-sm text-destructive">{{ error }}</div>
        } @else if (!cameras.length) {
          <div class="surface-card p-12 text-center text-sm text-muted-foreground">
            No cameras returned from the API.
          </div>
        } @else {
          <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            @for (c of cameras; track c.cameraKey || c.id; let i = $index) {
              <div class="relative">
                <button
                  type="button"
                  class="block w-full text-left"
                  (click)="makePrimary(c)"
                  [disabled]="!c.cameraKey || deletingId === c.cameraKey"
                >
                  <app-camera-tile [cam]="c" [delay]="i * 60"></app-camera-tile>
                </button>

                @if (isSuperAdmin && c.cameraKey) {
                  <button
                    type="button"
                    class="absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-destructive/30 bg-card/95 text-destructive shadow-sm hover:bg-destructive hover:text-white"
                    title="Delete camera"
                    [disabled]="deletingId === c.cameraKey"
                    (click)="confirmDelete(c, $event)"
                  >
                    <lucide-icon [img]="TrashIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
                  </button>
                }
              </div>
            }
          </section>
        }
      </div>
    </main>
  `,
})
export class CamerasComponent implements OnInit, OnDestroy {
  cameras: CameraInfo[] = [];
  loading = true;
  error = '';
  deletingId: string | null = null;
  readonly TrashIcon = Trash2;
  private subs = new Subscription();

  get online() {
    return this.cameras.filter((c) => c.status === 'online').length;
  }

  get isSuperAdmin() {
    return this.auth.isSuperAdmin();
  }

  constructor(
    private api: PpeApiService,
    private hub: PpeHubService,
    private auth: AuthService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    document.title = 'Live Camera Wall | Engro Fertilizer PPE Monitor';
    this.load();
    void this.hub.start();
    this.subs.add(
      this.hub.cameraStatusUpdated$.subscribe((cam) => {
        const key = cam.cameraKey || cam.id;
        const idx = this.cameras.findIndex((c) => (c.cameraKey || c.id) === key || c.id === cam.id);
        if (idx >= 0) {
          const next = [...this.cameras];
          next[idx] = { ...next[idx], ...cam, hue: next[idx].hue };
          this.cameras = next;
        } else {
          this.cameras = [...this.cameras, cam];
        }
      }),
    );
    this.subs.add(
      this.hub.primaryCameraSwitched$.subscribe((evt) => {
        this.cameras = this.cameras.map((c) => ({
          ...c,
          isPrimary:
            (c.cameraKey || '') === evt.cameraId ||
            c.id === evt.cameraCode ||
            c.id === evt.cameraId,
        }));
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  makePrimary(cam: CameraInfo) {
    const id = cam.cameraKey;
    if (!id || this.deletingId) return;
    this.api.setPrimaryCamera(id).subscribe({
      next: () => {
        this.cameras = this.cameras.map((c) => ({
          ...c,
          isPrimary: (c.cameraKey || c.id) === id,
        }));
        this.toast.success(`Primary camera set to ${cam.id}`);
      },
      error: (err: Error) => this.toast.show('Could not set primary camera', err.message),
    });
  }

  confirmDelete(cam: CameraInfo, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isSuperAdmin || !cam.cameraKey || this.deletingId) return;

    const ok = window.confirm(
      `Delete camera ${cam.id}?\n\nThis soft-deletes the camera. Detection history is kept.`,
    );
    if (!ok) return;

    this.deletingId = cam.cameraKey;
    this.api.deleteCamera(cam.cameraKey).subscribe({
      next: (res) => {
        if (res && res.success === false) {
          this.toast.show('Delete failed', res.message || 'Request failed');
          this.deletingId = null;
          return;
        }
        this.cameras = this.cameras.filter((c) => c.cameraKey !== cam.cameraKey);
        this.toast.success(`Deleted ${cam.id}`);
        this.deletingId = null;
      },
      error: (err: Error) => {
        this.toast.show('Delete failed', err.message);
        this.deletingId = null;
      },
    });
  }

  private load() {
    this.loading = true;
    this.error = '';
    this.subs.add(
      this.api.getCameras().subscribe({
        next: (cameras) => {
          this.cameras = cameras;
          this.api.getCameraStatus().subscribe({
            next: (status) => {
              if (!status.cameras.length) return;
              const byKey = new Map(
                status.cameras.map((s) => [s.cameraKey || s.id, s] as const),
              );
              this.cameras = this.cameras.map((c) => {
                const s = byKey.get(c.cameraKey || c.id) || byKey.get(c.id);
                return s ? { ...c, status: s.status, isPrimary: s.isPrimary ?? c.isPrimary } : c;
              });
            },
          });
          this.loading = false;
        },
        error: (err: Error) => {
          this.error = err.message || 'Failed to load cameras.';
          this.loading = false;
        },
      }),
    );
  }
}
