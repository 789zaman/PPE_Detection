import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { LucideAngularModule, Radio, VideoOff } from 'lucide-angular';
import { PrimaryCameraView } from '../../core/api/ppe-api.service';
import { DetectionOverlay } from '../../core/api/bounding-boxes';
import { DetectionOverlayComponent } from '../detection-overlay/detection-overlay.component';
import { ZoneOverlayComponent } from '../zone-overlay/zone-overlay.component';
import { CameraRoiZones } from '../../core/api/camera-zones';
import {
  isHlsUrl,
  isPlayableVideoUrl,
  isRtspUrl,
  isWhepUrl,
  resolvePlayableVideoUrl,
} from '../../core/api/stream-url';
import { resolveWhepUrl, WhepPlayer } from '../../core/webrtc/whep-player';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-camera-stream',
  standalone: true,
  imports: [LucideAngularModule, DetectionOverlayComponent, ZoneOverlayComponent],
  template: `
    <div class="surface-card animate-rise overflow-hidden p-0">
      <div class="flex items-center justify-between border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          @if (isLive) {
            <span class="relative flex h-2.5 w-2.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive"></span>
            </span>
          } @else {
            <span class="h-2.5 w-2.5 rounded-full bg-muted-foreground"></span>
          }
          <span class="text-sm font-semibold tracking-wide">LIVE · {{ title }}</span>
        </div>
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <span class="tabular-nums">{{ now }}</span>
          <lucide-icon [img]="RadioIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
        </div>
      </div>

      <div #stage class="relative aspect-video w-full overflow-hidden bg-black">
        @if (hasPlayableStream) {
          <video
            #videoEl
            class="h-full w-full object-contain bg-black"
            playsinline
            muted
            autoplay
            [attr.loop]="playbackMode === 'http' ? '' : null"
            (loadedmetadata)="onMediaReady()"
            (playing)="onPlaying()"
            (error)="onVideoError()"
            (waiting)="onWaiting()"
          ></video>

          <app-zone-overlay [zones]="zones" [mediaEl]="videoElRef"></app-zone-overlay>

          <app-detection-overlay
            [detections]="detections"
            [mediaEl]="videoElRef"
            [defaultFrameWidth]="frameWidth"
            [defaultFrameHeight]="frameHeight"
          ></app-detection-overlay>

          @if (streamError) {
            <div class="absolute inset-x-0 top-0 z-20 bg-destructive/90 px-3 py-2 text-center text-xs font-medium text-white">
              {{ streamError }}
            </div>
          } @else if (statusLabel) {
            <div class="absolute inset-x-0 top-0 z-20 bg-secondary/90 px-3 py-2 text-center text-xs font-medium text-foreground">
              {{ statusLabel }}
            </div>
          }
        } @else {
          <div class="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <lucide-icon [img]="VideoOffIcon" class="h-10 w-10 text-muted-foreground" [size]="40"></lucide-icon>
            <p class="font-display text-base font-semibold text-foreground">{{ emptyTitle }}</p>
            <p class="max-w-md text-sm text-muted-foreground">{{ emptyDetail }}</p>
            @if (detections.length) {
              <app-detection-overlay
                class="absolute inset-0"
                [detections]="detections"
                [defaultFrameWidth]="frameWidth"
                [defaultFrameHeight]="frameHeight"
              ></app-detection-overlay>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class CameraStreamComponent implements OnInit, OnChanges, OnDestroy {
  @Input() primary: PrimaryCameraView | null = null;
  @Input() detections: DetectionOverlay[] = [];
  @Input() zones: CameraRoiZones | null = null;
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  now = '';
  streamError = '';
  statusLabel = '';
  isLive = false;
  videoElRef: HTMLVideoElement | null = null;
  /** Resolved browser playback URL (WHEP or HTTP video). */
  playUrl: string | null = null;
  playbackMode: 'webrtc' | 'http' | null = null;
  readonly RadioIcon = Radio;
  readonly VideoOffIcon = VideoOff;

  private clock?: ReturnType<typeof setInterval>;
  private attachedKey = '';
  private whep?: WhepPlayer;

  get title() {
    if (this.primary?.code) {
      return `${this.primary.code}${this.primary.zoneName ? ` — ${this.primary.zoneName}` : ''}`;
    }
    return 'Primary camera';
  }

  get frameWidth(): number | undefined {
    return this.primary?.frameWidth && this.primary.frameWidth > 0
      ? this.primary.frameWidth
      : environment.inferenceFrameWidth;
  }

  get frameHeight(): number | undefined {
    return this.primary?.frameHeight && this.primary.frameHeight > 0
      ? this.primary.frameHeight
      : environment.inferenceFrameHeight;
  }

  get hasPlayableStream(): boolean {
    return !!this.playUrl;
  }

  get emptyTitle(): string {
    const raw = this.primary?.streamUrl?.trim() || this.primary?.whepUrl?.trim();
    if (raw && isRtspUrl(raw) && !this.primary?.whepUrl) {
      return 'RTSP cannot play in the browser';
    }
    if (raw && isHlsUrl(raw)) {
      return 'HLS is not supported';
    }
    return 'No live stream available';
  }

  get emptyDetail(): string {
    const raw = this.primary?.streamUrl?.trim() || this.primary?.whepUrl?.trim();
    if (this.primary?.protocol === 'rtsp' && !this.primary?.whepUrl) {
      return 'API returned RTSP only. Start MediaMTX and set LiveCamera WHEP URL so the FE can play WebRTC.';
    }
    if (raw && isHlsUrl(raw)) {
      return `HLS (.m3u8) is ignored. Use WHEP/WebRTC. Got: ${raw}`;
    }
    if (this.primary) {
      return `${this.primary.code || 'Primary camera'} has no whepUrl or HTTP videoUrl from GET /api/v1/ppe/dashboard/live.`;
    }
    return 'No primary camera in GET /api/v1/ppe/dashboard/live.';
  }

  ngOnInit() {
    this.clock = setInterval(() => (this.now = new Date().toLocaleTimeString()), 1000);
    this.now = new Date().toLocaleTimeString();
    this.refreshPlayback();
    queueMicrotask(() => this.attachStream());
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['primary']) {
      this.refreshPlayback();
      queueMicrotask(() => this.attachStream());
    }
  }

  ngOnDestroy() {
    if (this.clock) clearInterval(this.clock);
    this.clearVideo();
  }

  onMediaReady() {
    this.videoElRef = this.videoRef?.nativeElement ?? null;
    const video = this.videoElRef;
    if (video) {
      void video.play().catch(() => undefined);
    }
  }

  onPlaying() {
    this.isLive = true;
    this.streamError = '';
    this.statusLabel = '';
    this.videoElRef = this.videoRef?.nativeElement ?? null;
  }

  onWaiting() {
    if (this.isLive && this.playbackMode === 'http') this.statusLabel = 'Buffering…';
  }

  onVideoError() {
    if (this.playbackMode === 'webrtc') return;
    this.isLive = false;
    this.streamError = 'Could not load video. Check HTTP video URL or WHEP endpoint.';
    this.statusLabel = '';
  }

  private refreshPlayback() {
    const whep = resolveWhepUrl({
      whepUrl: this.primary?.whepUrl,
      streamUrl: this.primary?.streamUrl,
      fallback: environment.defaultWhepUrl || null,
    });
    if (whep || this.primary?.protocol === 'webrtc') {
      this.playUrl = whep || this.primary?.whepUrl?.trim() || null;
      this.playbackMode = this.playUrl ? 'webrtc' : null;
      return;
    }

    const http = resolvePlayableVideoUrl({
      streamUrl: this.primary?.streamUrl,
      videoUrl: null,
      fallback: environment.defaultVideoUrl || null,
    });
    if (http && isPlayableVideoUrl(http)) {
      this.playUrl = http;
      this.playbackMode = 'http';
      return;
    }

    this.playUrl = null;
    this.playbackMode = null;
  }

  private attachStream() {
    if (!this.playUrl || !this.playbackMode) {
      this.clearVideo();
      this.attachedKey = '';
      this.streamError = '';
      this.statusLabel = '';
      this.isLive = false;
      this.videoElRef = null;
      return;
    }

    const video = this.videoRef?.nativeElement;
    if (!video) {
      setTimeout(() => this.attachStream(), 50);
      return;
    }

    this.videoElRef = video;
    const key = `${this.playbackMode}|${this.playUrl}`;
    if (this.attachedKey === key) {
      return;
    }

    this.attachedKey = key;
    this.streamError = '';
    this.isLive = false;

    if (this.playbackMode === 'webrtc') {
      this.whep?.stop();
      video.removeAttribute('src');
      video.srcObject = null;
      this.statusLabel = 'Connecting WebRTC…';
      this.whep = new WhepPlayer({
        url: this.playUrl,
        video,
        onStatus: (status, detail) => {
          if (status === 'live') {
            this.isLive = true;
            this.streamError = '';
            this.statusLabel = '';
            this.videoElRef = video;
          } else if (status === 'connecting') {
            this.statusLabel = 'Connecting WebRTC…';
          } else if (status === 'error' || status === 'offline') {
            this.isLive = false;
            this.streamError = detail || 'WebRTC stream unavailable';
            this.statusLabel = '';
          }
        },
      });
      void this.whep.start();
      return;
    }

    this.whep?.stop();
    this.whep = undefined;
    this.statusLabel = 'Loading video…';
    video.srcObject = null;
    video.src = this.playUrl;
    video.load();
    void video.play().catch(() => undefined);
  }

  private clearVideo() {
    this.whep?.stop();
    this.whep = undefined;
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.srcObject = null;
      video.load();
    }
    this.isLive = false;
  }
}
