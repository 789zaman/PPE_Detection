import { Component, Input } from '@angular/core';
import { LucideAngularModule, Bell } from 'lucide-angular';
import {
  LogRow,
  collapseOpenViolationSessions,
  isLiveViolationNow,
  isShockingZone,
  liveAlarms,
  notDetectedLabel,
  zoneTypeLabel,
} from '../../lib/safety-data';

/**
 * Live PPE violation alerts beside the camera wall.
 * Two zone kinds: Outside zone | Shocking boundary zone.
 * Every PPE class uses clear copy: "Helmet not detected", etc.
 */
@Component({
  selector: 'app-alert-feed',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="surface-card animate-rise flex h-full flex-col p-0">
      <div class="flex items-center justify-between border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          <lucide-icon [img]="BellIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
          <h2 class="font-display text-sm font-semibold">Violation Alerts</h2>
        </div>
        <span class="gradient-primary rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
          {{ liveCount }} live
        </span>
      </div>

      <p class="border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
        Outside zone · Shocking boundary zone — every missing PPE listed clearly
      </p>

      <div class="max-h-[470px] flex-1 space-y-2 overflow-y-auto p-4">
        @for (l of alertLogs.slice(0, 24); track l.id) {
          <div
            class="animate-rise flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50"
            [class]="cardClass(l)"
          >
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" [class]="dotClass(l)"></span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <p class="truncate text-sm font-semibold">{{ title(l) }}</p>
                <span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold" [class]="severityBadge(l)">
                  {{ severityLabel(l) }}
                </span>
                <span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold" [class]="zoneBadge(l)">
                  {{ zoneLabel(l) }}
                </span>
                @if (isShocking(l)) {
                  <span class="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                    Immediate
                  </span>
                }
              </div>
              <p class="truncate text-xs text-muted-foreground">
                {{ l.worker }} · {{ ppeLabel(l) }} · {{ l.camera }}
              </p>
            </div>
            <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {{ formatTime(l.time) }}
            </span>
          </div>
        } @empty {
          <p class="py-8 text-center text-xs text-muted-foreground">No PPE violation alerts</p>
        }
      </div>
    </div>
  `,
})
export class AlertFeedComponent {
  @Input({ required: true }) logs: LogRow[] = [];
  readonly BellIcon = Bell;

  get alertLogs() {
    // Prefer open-session grouping when parent passes raw poll rows.
    return collapseOpenViolationSessions(liveAlarms(this.logs));
  }

  get liveCount() {
    return this.alertLogs.filter((l) => this.isLive(l)).length;
  }

  isLive(l: LogRow) {
    return isLiveViolationNow(l);
  }

  title(l: LogRow) {
    // Main line always names the missing PPE (never a generic Helmet default).
    return notDetectedLabel(l.missingPpe || l.type, l.missingPpe);
  }

  ppeLabel(l: LogRow) {
    return String(l.missingPpe || l.type || 'PPE').trim();
  }

  zoneLabel(l: LogRow) {
    return zoneTypeLabel(l.ppeZone);
  }

  isShocking(l: LogRow) {
    return isShockingZone(l.ppeZone, l.isImmediate);
  }

  formatTime(time: string) {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  severityLabel(l: LogRow) {
    if (this.isShocking(l)) return 'Critical';
    if (l.severity === 'Critical') return 'Critical';
    if (l.severity === 'Warning') return 'High';
    return l.severity;
  }

  severityBadge(l: LogRow) {
    const s = this.severityLabel(l);
    if (s === 'Critical') return 'bg-destructive/15 text-destructive';
    if (s === 'High' || s === 'Medium') return 'bg-amber-500/15 text-amber-700';
    return 'bg-secondary text-muted-foreground';
  }

  zoneBadge(l: LogRow) {
    if (this.isShocking(l)) return 'bg-destructive/15 text-destructive';
    return 'bg-sky-500/15 text-sky-800';
  }

  dotClass(l: LogRow) {
    if (this.isShocking(l) || this.severityLabel(l) === 'Critical') return 'bg-destructive';
    if (this.severityLabel(l) === 'High' || this.severityLabel(l) === 'Medium') return 'bg-amber-500';
    return 'bg-sky-500';
  }

  borderClass(l: LogRow) {
    if (this.isShocking(l) || this.severityLabel(l) === 'Critical') return 'border-destructive/40';
    if (this.severityLabel(l) === 'High') return 'border-amber-500/40';
    return 'border-sky-500/30';
  }

  cardClass(l: LogRow) {
    return this.isLive(l) ? `${this.borderClass(l)} ring-2 ring-destructive/50` : this.borderClass(l);
  }
}
