import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Camera, Plus, RefreshCw } from 'lucide-angular';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { PpeApiService } from '../../core/api/ppe-api.service';
import { ToastService } from '../../services/toast.service';

type ZoneOption = { id: string; code: string; name: string; isActive?: boolean };
type CameraRow = {
  id: string;
  code: string;
  name: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  status: string;
  isPrimary: boolean;
  isActive: boolean;
  workerCount: number;
};

@Component({
  selector: 'app-settings-cameras',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SiteHeaderComponent],
  template: `
    <main class="min-h-screen bg-transparent">
      <app-site-header></app-site-header>

      <div class="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        <section class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-display text-2xl font-bold">Settings · Cameras</h2>
            <p class="text-sm text-muted-foreground">
              Super Admin only · register cameras for the Live Cameras wall. Live dashboard plays a
              local/HTTP <code class="text-xs">streamUrl</code> video (same file the model detects on).
            </p>
          </div>
          <button
            type="button"
            (click)="reload()"
            class="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            <lucide-icon [img]="RefreshIcon" class="h-4 w-4" [size]="16"></lucide-icon>
            Refresh
          </button>
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
          <form class="surface-card animate-rise space-y-4 p-5" (ngSubmit)="saveZone()" #zoneForm="ngForm">
            <div class="flex items-center gap-2">
              <lucide-icon [img]="PlusIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
              <h3 class="font-display text-base font-semibold">Add zone</h3>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block space-y-1 text-xs font-medium text-muted-foreground">
                Zone code
                <input
                  name="zoneCode"
                  required
                  [(ngModel)]="zone.code"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="ZONE-SWA"
                />
              </label>
              <label class="block space-y-1 text-xs font-medium text-muted-foreground">
                Zone name
                <input
                  name="zoneName"
                  required
                  [(ngModel)]="zone.name"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Switchgear Room A"
                />
              </label>
            </div>
            <label class="block space-y-1 text-xs font-medium text-muted-foreground">
              Description (optional)
              <input
                name="zoneDescription"
                [(ngModel)]="zone.description"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <button
              type="submit"
              [disabled]="savingZone || zoneForm.invalid"
              class="gradient-primary inline-flex h-10 items-center rounded-md border-0 px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {{ savingZone ? 'Saving…' : 'Save zone' }}
            </button>
          </form>

          <form class="surface-card animate-rise space-y-4 p-5" (ngSubmit)="saveCamera()" #camForm="ngForm">
            <div class="flex items-center gap-2">
              <lucide-icon [img]="CameraIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
              <h3 class="font-display text-base font-semibold">Register camera</h3>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block space-y-1 text-xs font-medium text-muted-foreground">
                Camera code
                <input
                  name="code"
                  required
                  [(ngModel)]="camera.code"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="CAM-07"
                />
              </label>
              <label class="block space-y-1 text-xs font-medium text-muted-foreground">
                Display name
                <input
                  name="name"
                  required
                  [(ngModel)]="camera.name"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Switchgear Room A Cam"
                />
              </label>
            </div>

            <label class="block space-y-1 text-xs font-medium text-muted-foreground">
              Zone
              <select
                name="zoneId"
                required
                [(ngModel)]="camera.zoneId"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>Select zone</option>
                @for (z of zones; track z.id) {
                  <option [value]="z.id">{{ z.code }} — {{ z.name }}</option>
                }
              </select>
            </label>

            <label class="block space-y-1 text-xs font-medium text-muted-foreground">
              RTSP URL (required by API)
              <input
                name="rtspUrl"
                required
                [(ngModel)]="camera.rtspUrl"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="rtsp://user:pass@192.168.1.10/stream1"
              />
            </label>

            <label class="block space-y-1 text-xs font-medium text-muted-foreground">
              Video URL (local/HTTP .mp4 — stored as streamUrl)
              <input
                name="streamUrl"
                [(ngModel)]="camera.streamUrl"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="http://localhost:5288/videos/cam-live-01.mp4"
              />
            </label>

            <div class="flex flex-wrap gap-4 text-sm">
              <label class="inline-flex items-center gap-2">
                <input type="checkbox" [(ngModel)]="camera.isPrimary" name="isPrimary" />
                Set as primary
              </label>
              <label class="inline-flex items-center gap-2">
                <input type="checkbox" [(ngModel)]="camera.isActive" name="isActive" />
                Active
              </label>
            </div>

            @if (formError) {
              <p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ formError }}</p>
            }

            <button
              type="submit"
              [disabled]="savingCamera || camForm.invalid || !zones.length"
              class="gradient-primary inline-flex h-10 items-center rounded-md border-0 px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {{ savingCamera ? 'Saving…' : 'Register camera' }}
            </button>
            @if (!zones.length) {
              <p class="text-xs text-muted-foreground">Create a zone first before registering a camera.</p>
            }
          </form>
        </section>

        <section class="surface-card animate-rise overflow-hidden p-0">
          <div class="border-b border-border px-5 py-4">
            <h3 class="font-display text-base font-semibold">Registered cameras</h3>
            <p class="text-xs text-muted-foreground">{{ cameras.length }} camera(s) · shown on Live Cameras wall</p>
          </div>
          @if (loading) {
            <p class="p-5 text-sm text-muted-foreground">Loading…</p>
          } @else if (!cameras.length) {
            <p class="p-8 text-center text-sm text-muted-foreground">No cameras registered yet.</p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-secondary/80 text-left text-xs font-semibold">
                  <tr>
                    <th class="px-4 py-3">Code</th>
                    <th class="px-4 py-3">Name</th>
                    <th class="px-4 py-3">Zone</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3">Primary</th>
                    <th class="px-4 py-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of cameras; track c.id) {
                    <tr class="border-t border-border">
                      <td class="px-4 py-3 font-medium">{{ c.code }}</td>
                      <td class="px-4 py-3">{{ c.name }}</td>
                      <td class="px-4 py-3">{{ c.zoneName || c.zoneCode }}</td>
                      <td class="px-4 py-3 capitalize">{{ c.status }}</td>
                      <td class="px-4 py-3">{{ c.isPrimary ? 'Yes' : '—' }}</td>
                      <td class="px-4 py-3">{{ c.isActive ? 'Yes' : 'No' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    </main>
  `,
})
export class SettingsCamerasComponent implements OnInit {
  zones: ZoneOption[] = [];
  cameras: CameraRow[] = [];
  loading = true;
  savingZone = false;
  savingCamera = false;
  formError = '';

  zone = { code: '', name: '', description: '' };
  camera = {
    code: '',
    name: '',
    zoneId: '',
    rtspUrl: '',
    streamUrl: '',
    isPrimary: false,
    isActive: true,
  };

  readonly CameraIcon = Camera;
  readonly PlusIcon = Plus;
  readonly RefreshIcon = RefreshCw;

  constructor(
    private api: PpeApiService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    document.title = 'Settings · Cameras | Engro Fertilizer PPE Monitor';
    this.reload();
  }

  reload() {
    this.loading = true;
    this.api.getZones().subscribe({
      next: (zones) => {
        this.zones = (zones ?? []).map((z) => {
          const o = z as Record<string, unknown>;
          return {
            id: String(o['id'] ?? ''),
            code: String(o['code'] ?? ''),
            name: String(o['name'] ?? ''),
            isActive: o['isActive'] !== false,
          };
        });
        if (!this.camera.zoneId && this.zones[0]) this.camera.zoneId = this.zones[0].id;
      },
      error: (err: Error) => this.toast.show('Could not load zones', err.message),
    });

    this.api.getCameraRecords().subscribe({
      next: (rows) => {
        this.cameras = rows;
        this.loading = false;
      },
      error: (err: Error) => {
        this.formError = err.message;
        this.loading = false;
      },
    });
  }

  saveZone() {
    if (this.savingZone) return;
    this.savingZone = true;
    this.api
      .upsertZone({
        code: this.zone.code.trim(),
        name: this.zone.name.trim(),
        description: this.zone.description.trim() || null,
        isActive: true,
      })
      .subscribe({
        next: (res) => {
          if (res?.success === false) {
            this.toast.show('Zone not saved', res.message || 'Request failed');
            this.savingZone = false;
            return;
          }
          this.toast.success('Zone saved');
          this.zone = { code: '', name: '', description: '' };
          this.savingZone = false;
          this.reload();
        },
        error: (err: Error) => {
          this.toast.show('Zone not saved', err.message);
          this.savingZone = false;
        },
      });
  }

  saveCamera() {
    if (this.savingCamera) return;
    this.formError = '';
    this.savingCamera = true;
    this.api
      .upsertCamera({
        code: this.camera.code.trim(),
        name: this.camera.name.trim(),
        zoneId: this.camera.zoneId,
        rtspUrl: this.camera.rtspUrl.trim(),
        streamUrl: this.camera.streamUrl.trim() || null,
        isPrimary: this.camera.isPrimary,
        isActive: this.camera.isActive,
      })
      .subscribe({
        next: (res) => {
          if (res?.success === false) {
            this.formError = res.message || 'Could not register camera.';
            this.savingCamera = false;
            return;
          }
          this.toast.success('Camera registered', 'It will appear on the Live Cameras wall.');
          this.camera = {
            code: '',
            name: '',
            zoneId: this.zones[0]?.id ?? '',
            rtspUrl: '',
            streamUrl: '',
            isPrimary: false,
            isActive: true,
          };
          this.savingCamera = false;
          this.reload();
        },
        error: (err: Error) => {
          this.formError = err.message || 'Could not register camera.';
          this.savingCamera = false;
        },
      });
  }
}
