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
  CameraRoiZones,
  ScaledPolygon,
  buildScaledPolygons,
  pointsToSvg,
} from '../../core/api/camera-zones';

@Component({
  selector: 'app-zone-overlay',
  standalone: true,
  template: `
    <div #host class="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-hidden">
      <svg class="h-full w-full" [attr.viewBox]="viewBox" preserveAspectRatio="none">
        @for (poly of polygons; track poly.id) {
          <polygon
            [attr.points]="toPoints(poly)"
            [attr.fill]="poly.fill"
            [attr.stroke]="poly.stroke"
            stroke-width="2"
            stroke-linejoin="round"
          />
        }
      </svg>
    </div>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
        z-index: 4;
      }
    `,
  ],
})
export class ZoneOverlayComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() zones: CameraRoiZones | null = null;
  @Input() mediaEl: HTMLVideoElement | HTMLImageElement | null = null;
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  polygons: ScaledPolygon[] = [];
  viewBox = '0 0 1 1';
  private resizeObs?: ResizeObserver;

  ngAfterViewInit() {
    this.resizeObs = new ResizeObserver(() => this.relayout());
    this.resizeObs.observe(this.hostRef.nativeElement);
    this.relayout();
  }

  ngOnChanges(_c: SimpleChanges) {
    queueMicrotask(() => this.relayout());
  }

  ngOnDestroy() {
    this.resizeObs?.disconnect();
  }

  @HostListener('window:resize')
  onResize() {
    this.relayout();
  }

  toPoints(poly: ScaledPolygon) {
    return pointsToSvg(poly.points);
  }

  private relayout() {
    const host = this.hostRef?.nativeElement;
    if (!host) return;
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    this.viewBox = `0 0 ${cw || 1} ${ch || 1}`;

    let mediaW = 0;
    let mediaH = 0;
    const media = this.mediaEl;
    if (media instanceof HTMLVideoElement && media.videoWidth > 0) {
      mediaW = media.videoWidth;
      mediaH = media.videoHeight;
    } else if (media instanceof HTMLImageElement && media.naturalWidth > 0) {
      mediaW = media.naturalWidth;
      mediaH = media.naturalHeight;
    }

    this.polygons = buildScaledPolygons(this.zones, cw, ch, mediaW, mediaH);
  }
}
