import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Download, Search } from 'lucide-angular';
import {
  LogRow,
  isPpeAlarm,
  isShockingZone,
  notDetectedLabel,
  zoneTypeLabel,
} from '../../lib/safety-data';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-log-table',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="surface-card animate-rise p-0">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 class="font-display text-base font-semibold">Violation Log</h2>
          <p class="text-xs text-muted-foreground">
            {{ rows.length }} records · Outside zone &amp; Shocking boundary
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="relative">
            <lucide-icon
              [img]="SearchIcon"
              class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground"
              [size]="16"
            ></lucide-icon>
            <input
              [(ngModel)]="q"
              placeholder="Search violation, zone, camera…"
              class="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            (click)="exportExcel()"
            class="gradient-primary inline-flex h-10 items-center justify-center gap-2 rounded-md border-0 px-4 text-sm font-medium text-primary-foreground"
          >
            <lucide-icon [img]="DownloadIcon" class="h-4 w-4" [size]="16"></lucide-icon>
            Export to Excel
          </button>
        </div>
      </div>

      <div class="max-h-[430px] overflow-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-secondary/90 backdrop-blur">
            <tr class="text-left text-xs font-semibold text-secondary-foreground">
              @for (h of headers; track h) {
                <th class="px-4 py-3 whitespace-nowrap">{{ h }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (l of rows; track l.id) {
              <tr class="border-t border-border transition-colors hover:bg-accent/40">
                <td class="px-4 py-3 font-medium whitespace-nowrap">{{ l.id }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                  {{ formatTime(l.time) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap font-medium">
                  {{ notDetectedLabel(l.type, l.missingPpe) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    [class]="zoneBadge(l)"
                  >
                    {{ zoneTypeLabel(l.ppeZone) }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">{{ l.camera }}</td>
                <td class="px-4 py-3">
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    [class]="severityClass(l.severity)"
                  >
                    {{ l.severity }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class LogTableComponent {
  @Input({ required: true }) logs: LogRow[] = [];
  q = '';
  readonly headers = ['ID', 'Time', 'Violation', 'Zone type', 'Camera', 'Severity'];
  readonly SearchIcon = Search;
  readonly DownloadIcon = Download;
  readonly notDetectedLabel = notDetectedLabel;
  readonly zoneTypeLabel = zoneTypeLabel;

  constructor(private toast: ToastService) {}

  get rows() {
    const s = this.q.trim().toLowerCase();
    if (!s) return this.logs.filter((l) => isPpeAlarm(l));
    return this.logs.filter(
      (l) =>
        isPpeAlarm(l) &&
        [l.id, l.type, l.missingPpe, l.zone, zoneTypeLabel(l.ppeZone), l.camera, l.severity]
          .join(' ')
          .toLowerCase()
          .includes(s),
    );
  }

  formatTime(time: string) {
    return new Date(time).toLocaleString();
  }

  zoneBadge(l: LogRow) {
    return isShockingZone(l.ppeZone, l.isImmediate)
      ? 'bg-destructive/15 text-destructive'
      : 'bg-sky-500/15 text-sky-800';
  }

  severityClass(severity: string) {
    if (severity === 'High' || severity === 'Critical') return 'bg-destructive/10 text-destructive';
    if (severity === 'Medium' || severity === 'Warning') return 'bg-amber-500/15 text-amber-700';
    return 'bg-accent text-accent-foreground';
  }

  exportExcel() {
    const head = [
      'ID',
      'Timestamp',
      'Violation',
      'Zone type',
      'Plant zone',
      'Camera',
      'Severity',
    ];
    const body = this.rows.map((r) =>
      [
        r.id,
        new Date(r.time).toLocaleString(),
        notDetectedLabel(r.type, r.missingPpe),
        zoneTypeLabel(r.ppeZone),
        r.zone,
        r.camera,
        r.severity,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [head.join(','), ...body].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engro-ppe-violations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success(`Exported ${this.rows.length} records to Excel`);
  }
}
