import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  CLASS_LEGEND,
  DetectionClass,
  DetectionOverlay,
  boxLabel,
  classColor,
  containedMediaRect,
  inferenceFrameSize,
  scaleBoxesToVideoContent,
} from '../../core/api/bounding-boxes';

type DrawnBox = {
  key: string;
  left: number;
  top: number;
  w: number;
  h: number;
  label: string;
  color: string;
};

@Component({
  selector: 'app-detection-overlay',
  standalone: true,
  template: `
    <div #host class="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-hidden">
      @for (b of drawn; track b.key) {
        <div
          class="absolute box-border"
          [style.left.px]="b.left"
          [style.top.px]="b.top"
          [style.width.px]="b.w"
          [style.height.px]="b.h"
          [style.borderWidth.px]="2"
          [style.borderStyle]="'solid'"
          [style.borderColor]="b.color"
          [style.boxShadow]="'0 0 0 1px rgba(0,0,0,.35)'"
        >
          <span
            class="absolute left-0 max-w-[220px] truncate px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white"
            [style.top.px]="b.top < 22 ? 0 : -20"
            [style.background]="b.color"
          >
            {{ b.label }}
          </span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
        z-index: 5;
      }
    `,
  ],
})
export class DetectionOverlayComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() detections: DetectionOverlay[] = [];
  /** Optional video element used for object-contain content-box sizing (preferred). */
  @Input() mediaEl: HTMLVideoElement | HTMLImageElement | null = null;
  /** Camera/stream frame size from BE when detection omits frameWidth/Height. */
  @Input() defaultFrameWidth?: number;
  @Input() defaultFrameHeight?: number;
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  drawn: DrawnBox[] = [];
  readonly legend = CLASS_LEGEND;
  private resizeObs?: ResizeObserver;

  ngAfterViewInit() {
    this.resizeObs = new ResizeObserver(() => this.relayout());
    this.resizeObs.observe(this.hostRef.nativeElement);
    this.relayout();
  }

  ngOnChanges(_changes: SimpleChanges) {
    queueMicrotask(() => this.relayout());
  }

  ngOnDestroy() {
    this.resizeObs?.disconnect();
  }

  @HostListener('window:resize')
  onWinResize() {
    this.relayout();
  }

  private relayout() {
    const host = this.hostRef?.nativeElement;
    if (!host) return;
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    const envFallback = inferenceFrameSize();

    let mediaW = 0;
    let mediaH = 0;
    const media = this.mediaEl;
    if (media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0) {
      mediaW = media.videoWidth;
      mediaH = media.videoHeight;
    } else if (media instanceof HTMLImageElement && media.naturalWidth > 0 && media.naturalHeight > 0) {
      mediaW = media.naturalWidth;
      mediaH = media.naturalHeight;
    }

    const next: DrawnBox[] = [];
    for (const d of this.detections) {
      if (!d.boxes?.length) continue;

      // Prefer detection frame → camera frame → env 1920×1080. Never use video size as inference size.
      const frameW =
        (d.frameWidth && d.frameWidth > 0 && d.frameWidth) ||
        (this.defaultFrameWidth && this.defaultFrameWidth > 0 && this.defaultFrameWidth) ||
        envFallback.width;
      const frameH =
        (d.frameHeight && d.frameHeight > 0 && d.frameHeight) ||
        (this.defaultFrameHeight && this.defaultFrameHeight > 0 && this.defaultFrameHeight) ||
        envFallback.height;

      // Content box: if video aspect ≈ inference aspect, letterbox with frame size so
      // scaleX/scaleY match bridge pixels exactly. Else use decoded video rect.
      let content;
      if (mediaW > 0 && mediaH > 0) {
        const videoAspect = mediaW / mediaH;
        const frameAspect = frameW / frameH;
        const aspectClose = Math.abs(videoAspect - frameAspect) < 0.02;
        content = containedMediaRect(cw, ch, aspectClose ? frameW : mediaW, aspectClose ? frameH : mediaH);
      } else {
        content = containedMediaRect(cw, ch, frameW, frameH);
      }

      const scaled = scaleBoxesToVideoContent(d.boxes, content, frameW, frameH);
      const alarming = d.state === 'violation' || d.state === 'warning';
      scaled.forEach((b, i) => {
        const classKey = (b.classKey || d.fallbackClassKey || 'person') as DetectionClass;
        next.push({
          key: `${d.id}-${i}-${classKey}-${Math.round(b.left)}-${Math.round(b.top)}`,
          left: b.left,
          top: b.top,
          w: b.w,
          h: b.h,
          label: alarming ? d.label : boxLabel(b),
          color: alarming ? '#dc2626' : classColor(classKey),
        });
      });
    }
    this.drawn = next;
  }
}
