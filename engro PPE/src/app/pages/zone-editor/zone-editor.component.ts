import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  RefreshCw,
} from 'lucide-angular';
import { forkJoin, of, Subscription, catchError } from 'rxjs';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { CameraStreamInfo, PpeApiService } from '../../core/api/ppe-api.service';
import {
  CameraRoiZones,
  ShockingZone,
  ZonePoint,
  emptyCameraZones,
  cacheCameraZones,
  newShockingZoneId,
} from '../../core/api/camera-zones';
import { containedMediaRect } from '../../core/api/bounding-boxes';
import { resolvePlayableVideoUrl, isPlayableVideoUrl } from '../../core/api/stream-url';
import { resolveWhepUrl, WhepPlayer } from '../../core/webrtc/whep-player';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { resolveMediaUrl } from '../../core/api/media-url';

type DragState = { zoneId: string; index: number } | null;
type ScreenZone = { id: string; points: ZonePoint[] };
type CameraOption = { id: string; code: string; name: string; isPrimary: boolean };

@Component({
  selector: 'app-zone-editor',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SiteHeaderComponent],
  template: `
    <main class="min-h-screen bg-transparent">
      <app-site-header></app-site-header>

      <div class="mx-auto max-w-[1500px] space-y-4 px-6 py-6">
        <section class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-display text-2xl font-bold">Zone editor</h2>
            <p class="text-sm text-muted-foreground">
              Select a camera, then draw the shock-boundary polygon (≥3 points). Inside that
              boundary, missing PPE raises immediate all-PPE violations. Outside = OUTSIDE (no
              all-PPE alarms).
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              (click)="reload()"
              class="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              <lucide-icon [img]="RefreshIcon" class="h-4 w-4" [size]="16"></lucide-icon>
              Reload
            </button>
            <button
              type="button"
              (click)="save()"
              [disabled]="saving || !cameraCode"
              class="gradient-primary inline-flex h-10 items-center gap-2 rounded-md border-0 px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <lucide-icon [img]="SaveIcon" class="h-4 w-4" [size]="16"></lucide-icon>
              {{ saving ? 'Saving…' : 'Save zones' }}
            </button>
          </div>
        </section>

        <section class="surface-card flex flex-wrap items-center gap-3 p-4">
          <label class="text-xs font-medium text-muted-foreground">
            Camera
            <select
              [(ngModel)]="cameraCode"
              (ngModelChange)="onCameraChange()"
              class="ml-2 h-9 min-w-[220px] rounded-md border border-input bg-background px-2 text-sm"
            >
              @for (c of cameras; track c.code) {
                <option [value]="c.code">
                  {{ c.name || c.code }}{{ c.isPrimary ? ' (primary)' : '' }}
                </option>
              }
            </select>
          </label>

          <button
            type="button"
            (click)="addZone()"
            [disabled]="!cameraCode"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-50"
          >
            <lucide-icon [img]="PlusIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Add shock boundary
          </button>

          <div class="flex flex-wrap gap-2">
            @for (z of zones.shockingZones; track z.id; let i = $index) {
              <button
                type="button"
                (click)="selectZone(z.id)"
                class="rounded-full border px-3 py-1.5 text-xs font-semibold"
                [class]="
                  activeZoneId === z.id
                    ? 'border-destructive bg-destructive/15 text-destructive'
                    : 'border-border bg-secondary'
                "
              >
                {{ z.name || 'Shocking zone ' + (i + 1) }}
                <span class="ml-1 opacity-70">({{ z.points.length }} pts)</span>
              </button>
            } @empty {
              <span class="text-xs text-muted-foreground">No shock boundary — click Add, draw ≥3 points, then Save.</span>
            }
          </div>

          <button
            type="button"
            (click)="undo()"
            [disabled]="!activeZone"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <lucide-icon [img]="UndoIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Undo point
          </button>
          <button
            type="button"
            (click)="clearActive()"
            [disabled]="!activeZone"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <lucide-icon [img]="TrashIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Clear points
          </button>
          <button
            type="button"
            (click)="removeActive()"
            [disabled]="!activeZone"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <lucide-icon [img]="TrashIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            Delete zone
          </button>
          <button
            type="button"
            (click)="captureAndSaveSnapshot()"
            [disabled]="capturing || !cameraCode"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <lucide-icon [img]="PencilIcon" class="h-3.5 w-3.5" [size]="14"></lucide-icon>
            {{ capturing ? 'Saving snapshot…' : 'Capture & save snapshot' }}
          </button>

          <span class="text-xs text-muted-foreground">
            {{ mediaHint }} · {{ zones.frameWidth }}×{{ zones.frameHeight }}
          </span>
        </section>

        @if (error) {
          <div class="surface-card p-3 text-sm text-destructive">{{ error }}</div>
        }
        @if (statusHint) {
          <div class="surface-card p-3 text-sm text-muted-foreground">{{ statusHint }}</div>
        }

        <section class="surface-card overflow-hidden p-0">
          <div
            #stage
            class="relative aspect-video w-full cursor-crosshair select-none bg-black"
            (mousedown)="onPointerDown($event)"
            (mousemove)="onPointerMove($event)"
            (mouseup)="onPointerUp()"
            (mouseleave)="onPointerUp()"
          >
            @if (frameUrl) {
              <img
                #bgImg
                [src]="frameUrl"
                alt="Zone frame"
                class="h-full w-full object-contain"
                (load)="onMediaReady()"
                (error)="onFrameError()"
              />
            } @else {
              <video
                #videoEl
                class="h-full w-full object-contain bg-black"
                playsinline
                muted
                autoplay
                loop
                (loadedmetadata)="onMediaReady()"
                (playing)="onMediaReady()"
              ></video>
            }

            @if (!hasMedia) {
              <div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 px-6 text-center">
                <p class="text-sm text-white/90">
                  No frame for {{ cameraCode || 'camera' }}. Loading stream / snapshot…
                </p>
              </div>
            }

            <svg class="pointer-events-none absolute inset-0 h-full w-full">
              @for (sz of screenZones; track sz.id) {
                @if (sz.points.length >= 3) {
                  <polygon
                    [attr.points]="poly(sz.points)"
                    fill="rgba(220,38,38,0.18)"
                    [attr.stroke]="sz.id === activeZoneId ? '#dc2626' : '#f87171'"
                    [attr.stroke-width]="sz.id === activeZoneId ? 2.5 : 1.5"
                  />
                } @else if (sz.points.length >= 2) {
                  <polyline
                    [attr.points]="poly(sz.points)"
                    fill="none"
                    stroke="#dc2626"
                    stroke-width="2"
                  />
                }
                @for (p of sz.points; track $index) {
                  <circle
                    [attr.cx]="p.x"
                    [attr.cy]="p.y"
                    [attr.r]="sz.id === activeZoneId ? 5 : 4"
                    fill="#dc2626"
                    stroke="#fff"
                    stroke-width="1.5"
                  />
                }
              }
            </svg>
          </div>
        </section>
      </div>
    </main>
  `,
})
export class ZoneEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stage') stageRef?: ElementRef<HTMLDivElement>;
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('bgImg') imgRef?: ElementRef<HTMLImageElement>;

  cameras: CameraOption[] = [];
  cameraCode = '';
  primaryCode = '';
  zones: CameraRoiZones = emptyCameraZones('');
  activeZoneId: string | null = null;
  screenZones: ScreenZone[] = [];
  frameUrl: string | null = null;
  saving = false;
  capturing = false;
  error = '';
  statusHint = '';
  mediaHint = 'Select a camera';
  hasMedia = false;

  readonly SaveIcon = Save;
  readonly UndoIcon = Undo2;
  readonly TrashIcon = Trash2;
  readonly PencilIcon = Pencil;
  readonly RefreshIcon = RefreshCw;
  readonly PlusIcon = Plus;

  private drag: DragState = null;
  private content = { left: 0, top: 0, width: 0, height: 0 };
  private subs = new Subscription();
  private videoUrl: string | null = null;
  private whepUrl: string | null = null;
  private whep: WhepPlayer | null = null;
  private loadGen = 0;
  private pendingPersist: 'save' | 'delete' | null = null;

  constructor(
    private api: PpeApiService,
    private toast: ToastService,
  ) {}

  get activeZone(): ShockingZone | null {
    if (!this.activeZoneId) return null;
    return this.zones.shockingZones.find((z) => z.id === this.activeZoneId) ?? null;
  }

  ngOnInit() {
    document.title = 'Zone editor | Engro PPE';
    this.subs.add(
      forkJoin({
        cams: this.api.getCameraRecords().pipe(catchError(() => of([]))),
        live: this.api.getLive().pipe(catchError(() => of(null))),
      }).subscribe({
        next: ({ cams, live }) => {
          const primary = live && typeof live === 'object'
            ? (live as { primaryCamera?: Record<string, unknown> }).primaryCamera
            : undefined;
          this.primaryCode = String(primary?.['code'] ?? cams.find((c) => c.isPrimary)?.code ?? '');

          const list: CameraOption[] = (cams ?? [])
            .filter((c) => c.code)
            .map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name || c.code,
              isPrimary: c.isPrimary || c.code === this.primaryCode,
            }));

          if (this.primaryCode && !list.some((c) => c.code === this.primaryCode)) {
            list.unshift({
              id: '',
              code: this.primaryCode,
              name: String(primary?.['name'] ?? this.primaryCode),
              isPrimary: true,
            });
          }

          this.cameras = list.length
            ? list
            : this.primaryCode
              ? [{ id: '', code: this.primaryCode, name: this.primaryCode, isPrimary: true }]
              : [];

          this.cameraCode =
            list.find((c) => c.isPrimary)?.code ||
            this.primaryCode ||
            list[0]?.code ||
            '';

          if (this.cameraCode) this.reload();
          else this.statusHint = 'No cameras registered. Add a camera in Settings first.';
        },
        error: () => {
          this.error = 'Could not load cameras.';
        },
      }),
    );
  }

  ngAfterViewInit() {
    queueMicrotask(() => this.attachMedia());
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.clearMedia();
  }

  onCameraChange() {
    this.reload();
  }

  selectZone(id: string) {
    this.activeZoneId = id;
  }

  addZone() {
    if (!this.cameraCode) {
      this.toast.show('Select a camera', 'Choose a camera before adding a shock boundary.');
      return;
    }
    const n = this.zones.shockingZones.length + 1;
    const zone: ShockingZone = {
      id: newShockingZoneId(),
      name: n === 1 ? 'Shock boundary' : `Shocking zone ${n}`,
      points: [],
    };
    this.zones = {
      ...this.zones,
      cameraCode: this.cameraCode,
      shockingZones: [...this.zones.shockingZones, zone],
    };
    this.activeZoneId = zone.id;
    this.relayout();
  }

  reload() {
    if (!this.cameraCode) return;
    const gen = ++this.loadGen;
    this.error = '';
    this.statusHint = '';
    this.resetMediaState();

    this.subs.add(
      this.api.getCameraRoiZones(this.cameraCode).subscribe({
        next: (z) => {
          if (gen !== this.loadGen) return;
          this.zones = { ...z, cameraCode: this.cameraCode };
          this.activeZoneId = z.shockingZones[0]?.id ?? null;
          this.relayout();
        },
      }),
    );

    this.loadMediaForCamera(this.cameraCode, gen);
  }

  save() {
    this.persistZones('save');
  }

  undo() {
    const z = this.activeZone;
    if (!z) return;
    this.updateActivePoints(z.points.slice(0, -1));
  }

  clearActive() {
    if (!this.activeZone) return;
    this.updateActivePoints([]);
    this.persistZones('delete');
  }

  removeActive() {
    if (!this.activeZoneId) return;
    const next = this.zones.shockingZones.filter((z) => z.id !== this.activeZoneId);
    this.zones = { ...this.zones, cameraCode: this.cameraCode, shockingZones: next };
    this.activeZoneId = next[0]?.id ?? null;
    cacheCameraZones(this.zones);
    this.relayout();
    this.persistZones('delete');
  }

  /** Persist current polygons, including an empty list so Delete actually clears BE + cache. */
  private persistZones(reason: 'save' | 'delete') {
    if (!this.cameraCode) return;
    if (this.saving) {
      this.pendingPersist = reason;
      return;
    }

    const payload: CameraRoiZones = {
      ...this.zones,
      cameraCode: this.cameraCode,
      shockingZones: this.zones.shockingZones,
    };

    this.saving = true;
    this.error = '';
    cacheCameraZones(payload);
    this.subs.add(
      this.api.saveCameraRoiZones(payload).subscribe({
        next: (z) => {
          this.zones = z;
          this.activeZoneId =
            z.shockingZones.find((x) => x.id === this.activeZoneId)?.id ??
            z.shockingZones[0]?.id ??
            null;
          this.saving = false;
          const n = z.shockingZones.filter((x) => x.points.length >= 3).length;
          if (reason === 'delete' || n === 0) {
            this.toast.success(
              n === 0 ? 'Zone removed' : 'Zone deleted',
              n === 0
                ? `${this.cameraCode}: shock boundary cleared on the camera.`
                : `${this.cameraCode}: remaining boundary saved.`,
            );
            this.statusHint =
              n === 0
                ? 'No shock boundary on this camera. Inside-zone all-PPE alarms will not apply until you draw and save one.'
                : 'Shock boundary stored on camera (yellowZone). Re-run detector / ingest so all-PPE alarms apply inside it.';
          } else {
            this.toast.success(
              'Shock boundary saved',
              `${this.cameraCode}: written to yellowZone/redZone (BE shock boundary)`,
            );
            this.statusHint =
              n > 2
                ? 'Note: BE stores 2 polygons (yellowZone = shock boundary #1, redZone = #2). Extra zones stay in this browser only.'
                : 'Shock boundary stored on camera (yellowZone). Re-run detector / ingest so all-PPE alarms apply inside it.';
          }
          this.relayout();
          const queued = this.pendingPersist;
          this.pendingPersist = null;
          if (queued) this.persistZones(queued);
        },
        error: (err: Error) => {
          this.saving = false;
          this.error =
            err?.message ||
            'Could not save zones to API. Reload to see what is still stored on the camera.';
          this.toast.show(reason === 'delete' ? 'Delete failed' : 'Save failed', this.error);
          this.reload();
          const queued = this.pendingPersist;
          this.pendingPersist = null;
          if (queued) this.persistZones(queued);
        },
      }),
    );
  }

  /** Capture current video/img frame and upload to POST /captures. */
  captureAndSaveSnapshot() {
    if (!this.cameraCode || this.capturing) return;
    const blobPromise = this.grabFrameBlob();
    if (!blobPromise) {
      this.toast.show('No frame', 'Wait for stream or snapshot to load, then try again.');
      return;
    }
    this.capturing = true;
    blobPromise
      .then((blob) => {
        if (!blob) throw new Error('Empty frame');
        // Show local preview immediately
        if (this.frameUrl?.startsWith('blob:')) URL.revokeObjectURL(this.frameUrl);
        this.clearWhep();
        this.videoUrl = null;
        this.frameUrl = URL.createObjectURL(blob);
        this.hasMedia = true;
        queueMicrotask(() => this.onMediaReady());

        this.subs.add(
          this.api.saveCameraSnapshot(blob, this.cameraCode).subscribe({
            next: (url) => {
              this.capturing = false;
              if (url) {
                if (this.frameUrl?.startsWith('blob:')) URL.revokeObjectURL(this.frameUrl);
                this.frameUrl = url;
                this.mediaHint = `Snapshot saved · ${this.cameraCode}`;
                this.toast.success('Snapshot saved', 'Uploaded to /captures');
                queueMicrotask(() => this.onMediaReady());
              } else {
                this.toast.show(
                  'Snapshot kept locally',
                  'Upload returned no URL — frame is available for drawing only.',
                );
              }
            },
            error: (err: Error) => {
              this.capturing = false;
              this.toast.show(
                'Snapshot upload failed',
                err?.message || 'Frame kept locally for drawing; zones can still be saved.',
              );
            },
          }),
        );
      })
      .catch(() => {
        this.capturing = false;
        this.toast.show('Capture failed', 'Could not read the current frame.');
      });
  }

  poly(pts: ZonePoint[]) {
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }

  onMediaReady() {
    this.hasMedia = true;
    this.relayout();
  }

  onFrameError() {
    this.hasMedia = false;
    this.frameUrl = null;
    this.statusHint = 'Snapshot image failed to load — trying stream / primary fallback…';
    queueMicrotask(() => this.attachMedia());
  }

  onPointerDown(ev: MouseEvent) {
    const stage = this.stageRef?.nativeElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;

    // Ensure content box exists even before media metadata (use frame size).
    if (this.content.width <= 0) this.relayout();

    const hit = this.hitVertex(sx, sy);
    if (hit) {
      this.activeZoneId = hit.zoneId;
      this.drag = hit;
      ev.preventDefault();
      return;
    }

    if (!this.activeZoneId) this.addZone();
    if (!this.insideContent(sx, sy)) return;
    const frame = this.screenToFrame(sx, sy);
    if (!frame || !this.activeZone) return;
    this.updateActivePoints([...this.activeZone.points, frame]);
  }

  onPointerMove(ev: MouseEvent) {
    if (!this.drag) return;
    const stage = this.stageRef?.nativeElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const frame = this.screenToFrame(sx, sy);
    if (!frame) return;
    const zone = this.zones.shockingZones.find((z) => z.id === this.drag!.zoneId);
    if (!zone) return;
    const next = [...zone.points];
    next[this.drag.index] = frame;
    this.updateZonePoints(this.drag.zoneId, next);
  }

  onPointerUp() {
    this.drag = null;
  }

  private loadMediaForCamera(code: string, gen: number) {
    this.mediaHint = `Loading media · ${code}`;
    this.subs.add(
      forkJoin({
        stream: this.api.getCameraStream(code).pipe(catchError(() => of(null))),
        capture: this.api.getLatestCaptureUrl(code).pipe(catchError(() => of(null))),
        live: this.api.getLive().pipe(catchError(() => of(null))),
      }).subscribe({
        next: ({ stream, capture, live }) => {
          if (gen !== this.loadGen) return;
          this.applyStreamMeta(stream);

          const alertSnap = this.alertSnapshotFor(live, code);
          const snapshot = capture || alertSnap;

          if (this.applyPlayback(stream)) {
            this.mediaHint = `Live stream · ${code}`;
            this.statusHint = '';
            queueMicrotask(() => this.attachMedia());
            return;
          }

          if (snapshot) {
            this.frameUrl = snapshot;
            this.mediaHint = `Snapshot · ${code}`;
            this.statusHint = '';
            this.hasMedia = true;
            queueMicrotask(() => this.onMediaReady());
            return;
          }

          // Fallback: primary camera stream / snapshot
          if (this.primaryCode && this.primaryCode !== code) {
            this.statusHint = `No media for ${code} — loading primary camera (${this.primaryCode}) snapshot…`;
            this.loadPrimaryFallback(gen);
            return;
          }

          this.mediaHint = 'No stream or snapshot';
          this.statusHint =
            'No stream/snapshot for this camera. Capture will work once a frame is available, or set a primary camera with live video.';
          // Still allow drawing on empty 1920×1080 canvas
          this.relayout();
        },
        error: () => {
          if (gen !== this.loadGen) return;
          if (this.primaryCode && this.primaryCode !== code) this.loadPrimaryFallback(gen);
        },
      }),
    );
  }

  private loadPrimaryFallback(gen: number) {
    const code = this.primaryCode;
    if (!code) return;
    this.subs.add(
      forkJoin({
        stream: this.api.getCameraStream(code).pipe(catchError(() => of(null))),
        capture: this.api.getLatestCaptureUrl(code).pipe(catchError(() => of(null))),
        live: this.api.getLive().pipe(catchError(() => of(null))),
      }).subscribe({
        next: ({ stream, capture, live }) => {
          if (gen !== this.loadGen) return;
          const primary = live && typeof live === 'object'
            ? (live as { primaryCamera?: Record<string, unknown> }).primaryCamera
            : undefined;
          const fromLive = primary
            ? this.mapLivePrimaryToStream(primary)
            : null;
          const s = stream || fromLive;
          this.applyStreamMeta(s);

          if (this.applyPlayback(s)) {
            this.mediaHint = `Primary stream fallback · ${code}`;
            queueMicrotask(() => this.attachMedia());
            return;
          }

          const snap = capture || this.alertSnapshotFor(live, code);
          if (snap) {
            this.frameUrl = snap;
            this.mediaHint = `Primary snapshot fallback · ${code}`;
            this.hasMedia = true;
            queueMicrotask(() => this.onMediaReady());
            return;
          }

          this.statusHint = 'Primary camera also has no stream/snapshot.';
          this.relayout();
        },
      }),
    );
  }

  private mapLivePrimaryToStream(cam: Record<string, unknown>): CameraStreamInfo {
    return {
      code: String(cam['code'] ?? this.primaryCode),
      protocol: (cam['protocol'] as string | null) ?? null,
      whepUrl: (cam['whepUrl'] as string | null) ?? null,
      streamUrl: (cam['streamUrl'] as string | null) ?? (cam['videoUrl'] as string | null) ?? null,
      videoUrl: (cam['videoUrl'] as string | null) ?? null,
      frameWidth: Number(cam['frameWidth'] ?? 0) || undefined,
      frameHeight: Number(cam['frameHeight'] ?? 0) || undefined,
    };
  }

  private applyStreamMeta(stream: CameraStreamInfo | null) {
    if (!stream) return;
    if (stream.frameWidth && stream.frameWidth > 0) this.zones.frameWidth = stream.frameWidth;
    if (stream.frameHeight && stream.frameHeight > 0) this.zones.frameHeight = stream.frameHeight;
  }

  /** Returns true if video/whep will be used (not snapshot). */
  private applyPlayback(stream: CameraStreamInfo | null): boolean {
    this.whepUrl = null;
    this.videoUrl = null;
    this.frameUrl = null;

    if (!stream) return false;

    const whep = resolveWhepUrl({
      whepUrl: stream.whepUrl,
      streamUrl: stream.streamUrl || stream.videoUrl,
    });
    if (whep || stream.protocol === 'webrtc') {
      this.whepUrl = whep || stream.whepUrl?.trim() || null;
      if (this.whepUrl) return true;
    }

    const http = resolvePlayableVideoUrl({
      streamUrl: stream.streamUrl || stream.videoUrl,
      videoUrl: stream.videoUrl,
      fallback: environment.defaultVideoUrl || null,
    });
    if (http && isPlayableVideoUrl(http)) {
      this.videoUrl = http;
      return true;
    }
    return false;
  }

  private alertSnapshotFor(live: unknown, cameraCode: string): string | null {
    if (!live || typeof live !== 'object') return null;
    const alerts = (live as { latestAlerts?: unknown[] }).latestAlerts;
    if (!Array.isArray(alerts)) return null;
    for (const a of alerts) {
      if (!a || typeof a !== 'object') continue;
      const o = a as Record<string, unknown>;
      const cam = String(o['cameraCode'] ?? o['cameraName'] ?? '');
      if (cam && cam !== cameraCode) continue;
      const url = resolveMediaUrl(
        typeof o['imagePath'] === 'string'
          ? o['imagePath']
          : typeof o['imageUrl'] === 'string'
            ? o['imageUrl']
            : null,
      );
      if (url && !url.startsWith('C:') && !url.includes('/PPE_Detection/')) return url;
    }
    return null;
  }

  private resetMediaState() {
    this.clearMedia();
    this.frameUrl = null;
    this.videoUrl = null;
    this.whepUrl = null;
    this.hasMedia = false;
  }

  private attachMedia() {
    if (this.frameUrl) return;
    const video = this.videoRef?.nativeElement;
    if (!video) {
      setTimeout(() => this.attachMedia(), 50);
      return;
    }

    if (this.whepUrl) {
      this.clearWhep();
      video.removeAttribute('src');
      video.srcObject = null;
      this.whep = new WhepPlayer({
        url: this.whepUrl,
        video,
        onStatus: (status) => {
          if (status === 'live') {
            this.hasMedia = true;
            this.relayout();
          }
        },
      });
      this.whep.start();
      return;
    }

    if (this.videoUrl) {
      this.clearWhep();
      if (video.getAttribute('src') === this.videoUrl) return;
      video.srcObject = null;
      video.src = this.videoUrl;
      video.load();
      void video.play().catch(() => undefined);
    }
  }

  private clearMedia() {
    this.clearWhep();
    this.clearVideo();
    if (this.frameUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.frameUrl);
    }
  }

  private clearWhep() {
    this.whep?.stop();
    this.whep = null;
  }

  private clearVideo() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.load();
  }

  private grabFrameBlob(): Promise<Blob | null> | null {
    const video = this.videoRef?.nativeElement;
    if (video && video.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
    }
    const img = this.imgRef?.nativeElement;
    if (img && img.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      try {
        ctx.drawImage(img, 0, 0);
      } catch {
        return null;
      }
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
    }
    return null;
  }

  private updateActivePoints(points: ZonePoint[]) {
    if (!this.activeZoneId) return;
    this.updateZonePoints(this.activeZoneId, points);
  }

  private updateZonePoints(zoneId: string, points: ZonePoint[]) {
    this.zones = {
      ...this.zones,
      shockingZones: this.zones.shockingZones.map((z) =>
        z.id === zoneId ? { ...z, points } : z,
      ),
    };
    this.relayout();
  }

  private hitVertex(sx: number, sy: number): DragState {
    for (const sz of this.screenZones) {
      for (let i = 0; i < sz.points.length; i++) {
        const dx = sz.points[i].x - sx;
        const dy = sz.points[i].y - sy;
        if (dx * dx + dy * dy <= 64) return { zoneId: sz.id, index: i };
      }
    }
    return null;
  }

  private insideContent(sx: number, sy: number) {
    const c = this.content;
    return sx >= c.left && sy >= c.top && sx <= c.left + c.width && sy <= c.top + c.height;
  }

  private screenToFrame(sx: number, sy: number): ZonePoint | null {
    const c = this.content;
    if (c.width <= 0 || c.height <= 0) return null;
    const fw = this.zones.frameWidth || 1920;
    const fh = this.zones.frameHeight || 1080;
    const x = ((sx - c.left) / c.width) * fw;
    const y = ((sy - c.top) / c.height) * fh;
    return {
      x: Math.max(0, Math.min(fw, Math.round(x))),
      y: Math.max(0, Math.min(fh, Math.round(y))),
    };
  }

  private frameToScreen(p: ZonePoint): ZonePoint {
    const c = this.content;
    const fw = this.zones.frameWidth || 1920;
    const fh = this.zones.frameHeight || 1080;
    return {
      x: c.left + (p.x / fw) * c.width,
      y: c.top + (p.y / fh) * c.height,
    };
  }

  private relayout() {
    const stage = this.stageRef?.nativeElement;
    if (!stage) return;
    const cw = stage.clientWidth;
    const ch = stage.clientHeight;
    const fw = this.zones.frameWidth || 1920;
    const fh = this.zones.frameHeight || 1080;

    let mediaW = fw;
    let mediaH = fh;
    const video = this.videoRef?.nativeElement;
    const img = this.imgRef?.nativeElement;
    if (this.frameUrl && img && img.naturalWidth > 0) {
      mediaW = img.naturalWidth;
      mediaH = img.naturalHeight;
    } else if (video && video.videoWidth > 0) {
      mediaW = video.videoWidth;
      mediaH = video.videoHeight;
    }
    const aspectClose = Math.abs(mediaW / mediaH - fw / fh) < 0.02;
    this.content = containedMediaRect(cw, ch, aspectClose ? fw : mediaW, aspectClose ? fh : mediaH);
    this.screenZones = this.zones.shockingZones.map((z) => ({
      id: z.id,
      points: z.points.map((p) => this.frameToScreen(p)),
    }));
  }
}
