import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="surface-card lift animate-rise p-5" [style.animationDelay.ms]="delay">
      <div class="flex items-start justify-between">
        <div
          class="gradient-primary animate-pulse-ring flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground"
        >
          <lucide-icon [img]="icon" class="h-5 w-5" [size]="20"></lucide-icon>
        </div>
        <span
          class="rounded-full px-2 py-1 text-[11px] font-semibold"
          [class]="
            up ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'
          "
        >
          {{ up ? '▲' : '▼' }} {{ absDelta }}%
        </span>
      </div>

      <p class="mt-4 text-sm font-medium text-muted-foreground">{{ label }}</p>
      <p class="font-display mt-1 text-4xl font-bold tracking-tight tabular-nums">
        <span class="text-gradient-primary">{{ value.toFixed(1) }}%</span>
      </p>
      <p class="mt-1 text-xs text-muted-foreground">{{ count }} events in last 24h</p>

      <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          class="gradient-primary h-full rounded-full transition-[width] duration-1000 ease-out"
          [style.width.%]="Math.min(percent * 2.2, 100)"
        ></div>
      </div>
    </div>
  `,
})
export class StatCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) icon!: LucideIconData;
  @Input({ required: true }) percent!: number;
  @Input({ required: true }) count!: number;
  @Input({ required: true }) delta!: number;
  @Input() delay = 0;

  value = 0;
  up = true;
  absDelta = '0.0';
  readonly Math = Math;
  private raf = 0;

  ngOnChanges(changes: SimpleChanges) {
    this.up = this.delta >= 0;
    this.absDelta = Math.abs(this.delta).toFixed(1);
    if (changes['percent']) {
      this.animateTo(this.percent);
    }
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
  }

  private animateTo(target: number) {
    cancelAnimationFrame(this.raf);
    const start = performance.now();
    const from = this.value;
    const tick = (t: number) => {
      const p = Math.min((t - start) / 700, 1);
      this.value = from + (target - from) * (1 - Math.pow(1 - p, 3));
      if (p < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
