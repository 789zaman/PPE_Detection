import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, ImageOff, ShieldAlert } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { LogRow, notDetectedLabel } from '../../lib/safety-data';
import { resolveMediaUrl } from '../../core/api/media-url';

const HUE: Record<string, number> = {
  Helmet: 150,
  Gloves: 200,
  'Safety Glasses': 95,
  'Arc Flash Suit': 40,
  'Arc Flash Shield': 25,
  Boots: 280,
};

@Component({
  selector: 'app-violation-snapshot',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div
      class="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary"
      [class]="className"
      [style.backgroundImage]="hasImage && !imageFailed ? null : bg"
    >
      @if (displayUrl && !imageFailed) {
        <img
          [src]="displayUrl"
          [alt]="log.type + ' snapshot'"
          class="absolute inset-0 h-full w-full object-cover"
          (error)="onImgError()"
        />
      } @else {
        <div
          class="absolute inset-0 opacity-20"
          [style.backgroundImage]="
            'linear-gradient(to right, oklch(1 0 0 / .35) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / .35) 1px, transparent 1px)'
          "
          style="background-size: 26px 26px"
        ></div>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-muted-foreground">
          <lucide-icon [img]="ImageOffIcon" class="h-5 w-5" [size]="20"></lucide-icon>
          <span class="text-[10px] font-medium">{{ emptyReason }}</span>
        </div>
      }

      <div
        class="absolute bottom-1.5 left-2 flex items-center gap-1 rounded bg-card/85 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
      >
        <lucide-icon [img]="ShieldAlertIcon" class="h-3 w-3 text-destructive" [size]="12"></lucide-icon>
        {{ log.camera }} · {{ notDetectedLabel(log.type, log.missingPpe) }}
      </div>
      <span class="absolute right-2 bottom-1.5 rounded bg-card/85 px-1.5 py-0.5 text-[10px] tabular-nums backdrop-blur">
        {{ formatTime(log.time) }}
      </span>
    </div>
  `,
})
export class ViolationSnapshotComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) log!: LogRow;
  @Input() className = '';
  imageFailed = false;
  blobUrl: string | null = null;
  private triedAuthFetch = false;
  private sub?: Subscription;
  private readonly http = inject(HttpClient);
  readonly ShieldAlertIcon = ShieldAlert;
  readonly ImageOffIcon = ImageOff;
  readonly notDetectedLabel = notDetectedLabel;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['log']) {
      this.imageFailed = false;
      this.triedAuthFetch = false;
      this.revokeBlob();
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.revokeBlob();
  }

  get imageUrl() {
    return resolveMediaUrl(this.log?.imagePath);
  }

  get displayUrl() {
    return this.blobUrl || this.imageUrl;
  }

  get hasImage() {
    return !!this.displayUrl;
  }

  get emptyReason() {
    if (!this.log?.imagePath) {
      return 'No snapshot (detector imagePath empty)';
    }
    if (this.imageFailed) {
      return 'Snapshot unavailable (file missing / 404)';
    }
    return 'No snapshot path';
  }

  get hue() {
    return HUE[this.log.type] ?? 150;
  }

  get bg() {
    const hue = this.hue;
    return `radial-gradient(120% 90% at 50% 0%, oklch(0.94 0.05 ${hue}) 0%, oklch(0.82 0.06 ${hue}) 45%, oklch(0.53 0.06 ${hue}) 100%)`;
  }

  formatTime(time: string) {
    return new Date(time).toLocaleString();
  }

  onImgError() {
    const url = this.imageUrl;
    if (!url || this.triedAuthFetch || url.startsWith('blob:') || url.startsWith('data:')) {
      this.imageFailed = true;
      return;
    }
    // Retry once via authenticated HttpClient (covers protected media if static 401s).
    this.triedAuthFetch = true;
    this.sub?.unsubscribe();
    this.sub = this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0 || !blob.type.startsWith('image/')) {
          this.imageFailed = true;
          return;
        }
        this.revokeBlob();
        this.blobUrl = URL.createObjectURL(blob);
        this.imageFailed = false;
      },
      error: () => {
        this.imageFailed = true;
      },
    });
  }

  private revokeBlob() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
