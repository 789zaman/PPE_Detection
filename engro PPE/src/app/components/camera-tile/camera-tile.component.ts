import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { LucideAngularModule, Wifi, WifiOff } from 'lucide-angular';

export type CameraInfo = {
  id: string;
  zone: string;
  status: 'online' | 'offline';
  hue: number;
  /** Backend camera id/guid used for primary switch APIs. */
  cameraKey?: string;
  isPrimary?: boolean;
};

@Component({
  selector: 'app-camera-tile',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="surface-card animate-rise overflow-hidden p-0" [style.animationDelay.ms]="delay">
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <div class="flex items-center gap-2">
          @if (cam.status === 'online') {
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
              <span class="relative inline-flex h-2 w-2 rounded-full bg-destructive"></span>
            </span>
          } @else {
            <span class="h-2 w-2 rounded-full bg-muted-foreground"></span>
          }
          <span class="text-xs font-semibold">{{ cam.id }}</span>
        </div>
        @if (cam.status === 'online') {
          <lucide-icon [img]="WifiIcon" class="h-3.5 w-3.5 text-primary" [size]="14"></lucide-icon>
        } @else {
          <lucide-icon [img]="WifiOffIcon" class="h-3.5 w-3.5 text-muted-foreground" [size]="14"></lucide-icon>
        }
      </div>

      <div class="relative aspect-video w-full overflow-hidden bg-secondary" [style.backgroundImage]="bg">
        <div
          class="absolute inset-0 opacity-20"
          [style.backgroundImage]="
            'linear-gradient(to right, oklch(1 0 0 / .35) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / .35) 1px, transparent 1px)'
          "
          style="background-size: 28px 28px"
        ></div>

        @if (cam.status === 'online') {
          <div
            class="animate-scanline absolute inset-x-0 top-0 h-10"
            style="background: linear-gradient(to bottom, transparent, color-mix(in oklch, var(--primary) 35%, transparent), transparent)"
          ></div>
          <div
            class="absolute rounded border-2 border-primary transition-all duration-1000 ease-out"
            [style.left.%]="box.x"
            [style.top.%]="box.y"
            [style.width.%]="box.w"
            [style.height.%]="box.h"
          >
            <span
              class="gradient-primary absolute -top-4 left-0 rounded px-1 text-[9px] font-semibold text-primary-foreground"
            >
              PPE OK
            </span>
          </div>
          <span class="absolute bottom-1.5 left-2 rounded bg-card/85 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
            {{ people }} workers
          </span>
          <span class="absolute right-2 bottom-1.5 rounded bg-card/85 px-1.5 py-0.5 text-[10px] tabular-nums backdrop-blur">
            {{ now }}
          </span>
        } @else {
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="rounded bg-card/85 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              Signal lost
            </span>
          </div>
        }
      </div>

      <div class="px-3 py-2">
        <p class="truncate text-xs font-medium">{{ cam.zone }}</p>
      </div>
    </div>
  `,
})
export class CameraTileComponent implements OnInit, OnDestroy {
  @Input({ required: true }) cam!: CameraInfo;
  @Input() delay = 0;
  now = '';
  box = { x: 28, y: 30, w: 24, h: 40 };
  people = 1;
  readonly WifiIcon = Wifi;
  readonly WifiOffIcon = WifiOff;
  private timers: ReturnType<typeof setInterval>[] = [];

  get bg() {
    if (this.cam.status === 'offline') {
      return 'linear-gradient(135deg, oklch(0.85 0 0), oklch(0.72 0 0))';
    }
    const hue = this.cam.hue;
    return `radial-gradient(120% 90% at 50% 0%, oklch(0.94 0.05 ${hue}) 0%, oklch(0.82 0.06 ${hue}) 45%, oklch(0.54 0.06 ${hue}) 100%)`;
  }

  ngOnInit() {
    this.timers.push(setInterval(() => (this.now = new Date().toLocaleTimeString()), 1000));
    if (this.cam.status === 'online') {
      this.timers.push(
        setInterval(
          () => {
            this.box = {
              x: 12 + Math.random() * 55,
              y: 18 + Math.random() * 32,
              w: 16 + Math.random() * 14,
              h: 30 + Math.random() * 18,
            };
            this.people = 1 + Math.floor(Math.random() * 4);
          },
          2000 + Math.random() * 1500,
        ),
      );
    }
  }

  ngOnDestroy() {
    this.timers.forEach(clearInterval);
  }
}
