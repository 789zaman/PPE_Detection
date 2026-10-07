import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, CalendarDays, Download, Filter, RotateCcw } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { ViolationSnapshotComponent } from '../../components/violation-snapshot/violation-snapshot.component';
import { LogRow, VIOLATION_TYPES, isShockingZone, notDetectedLabel, shareSiblingSnapshots, zoneTypeLabel } from '../../lib/safety-data';
import { ToastService } from '../../services/toast.service';
import { PpeApiService } from '../../core/api/ppe-api.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SiteHeaderComponent, ViolationSnapshotComponent],
  template: `
    <main class="min-h-screen bg-transparent">
      <app-site-header></app-site-header>

      <div class="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        <section class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-display text-2xl font-bold">Violation History</h2>
            <p class="text-sm text-muted-foreground">
              {{ totalCount }} detections between {{ from }} and {{ to }}
            </p>
          </div>
          <button
            type="button"
            (click)="exportExcel()"
            class="gradient-primary inline-flex h-10 items-center justify-center gap-2 rounded-md border-0 px-4 text-sm font-medium text-primary-foreground"
          >
            <lucide-icon [img]="DownloadIcon" class="h-4 w-4" [size]="16"></lucide-icon>
            Export to Excel
          </button>
        </section>

        <section class="surface-card animate-rise flex flex-wrap items-end gap-4 p-5">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <lucide-icon [img]="FilterIcon" class="h-4 w-4 text-primary" [size]="16"></lucide-icon>
            Filters
          </div>
          <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <div class="relative">
              <lucide-icon
                [img]="CalendarIcon"
                class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground"
                [size]="16"
              ></lucide-icon>
              <input
                type="date"
                [(ngModel)]="from"
                (ngModelChange)="reload()"
                [max]="to"
                class="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <div class="relative">
              <lucide-icon
                [img]="CalendarIcon"
                class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground"
                [size]="16"
              ></lucide-icon>
              <input
                type="date"
                [(ngModel)]="to"
                (ngModelChange)="reload()"
                [min]="from"
                class="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </label>
          <div class="flex flex-wrap gap-2">
            @for (t of types; track t) {
              <button
                type="button"
                (click)="setType(t)"
                class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                [class]="
                  type === t
                    ? 'gradient-primary border-transparent text-primary-foreground'
                    : 'border-border bg-secondary text-secondary-foreground hover:bg-accent'
                "
              >
                {{ t }}
              </button>
            }
          </div>
          <button
            type="button"
            (click)="reset()"
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            <lucide-icon [img]="ResetIcon" class="h-4 w-4" [size]="16"></lucide-icon>
            Reset
          </button>
        </section>

        @if (loading) {
          <p class="text-sm text-muted-foreground">Loading violations…</p>
        } @else if (error) {
          <div class="surface-card p-4 text-sm text-destructive">{{ error }}</div>
        } @else if (rows.length === 0) {
          <div class="surface-card p-12 text-center text-sm text-muted-foreground">
            No violations match the selected filters.
          </div>
        } @else {
          <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            @for (l of rows; track l.id; let i = $index) {
              <button
                type="button"
                (click)="active = l"
                [style.animationDelay.ms]="Math.min(i, 12) * 50"
                class="surface-card animate-rise overflow-hidden p-3 text-left transition-transform hover:-translate-y-1"
              >
                <app-violation-snapshot [log]="l"></app-violation-snapshot>
                <div class="mt-3 space-y-1.5">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-sm font-semibold">{{ notDetectedLabel(l.type, l.missingPpe) }}</span>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      [class]="severityClass(l.severity)"
                    >
                      {{ l.severity }}
                    </span>
                  </div>
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                    [class]="zoneBadgeClass(l)"
                  >
                    {{ zoneTypeLabel(l.ppeZone) }}
                  </span>
                  <p class="truncate text-xs text-muted-foreground">{{ l.zone }} · {{ l.camera }}</p>
                  <p class="text-xs text-muted-foreground">{{ l.worker }} · {{ l.id }}</p>
                </div>
              </button>
            }
          </section>
        }
      </div>

      @if (active) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="active = null">
          <div
            class="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 class="font-display text-lg font-semibold">
                  {{ notDetectedLabel(active.type, active.missingPpe) }}
                </h3>
                <p class="mt-1 text-xs text-muted-foreground">{{ active.id }}</p>
              </div>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
                (click)="active = null"
              >
                ✕
              </button>
            </div>
            <div class="space-y-4">
              <app-violation-snapshot [log]="active"></app-violation-snapshot>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                @for (item of detailItems; track item[0]) {
                  <div class="rounded-lg bg-secondary/60 px-3 py-2">
                    <dt class="text-[11px] font-medium text-muted-foreground">{{ item[0] }}</dt>
                    <dd class="font-semibold">{{ item[1] }}</dd>
                  </div>
                }
              </dl>
            </div>
          </div>
        </div>
      }
    </main>
  `,
})
export class HistoryComponent implements OnInit, OnDestroy {
  rows: LogRow[] = [];
  totalCount = 0;
  from = iso(new Date(Date.now() - 13 * 86400000));
  to = iso(new Date());
  type = 'All';
  active: LogRow | null = null;
  types = ['All', ...VIOLATION_TYPES];
  loading = true;
  error = '';
  readonly Math = Math;
  readonly DownloadIcon = Download;
  readonly FilterIcon = Filter;
  readonly CalendarIcon = CalendarDays;
  readonly ResetIcon = RotateCcw;
  private subs = new Subscription();

  constructor(
    private api: PpeApiService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    document.title = 'Violation History & Snapshots | Engro Fertilizer PPE Monitor';
    this.reload();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get detailItems(): [string, string][] {
    if (!this.active) return [];
    return [
      ['Violation', notDetectedLabel(this.active.type, this.active.missingPpe)],
      ['Zone type', zoneTypeLabel(this.active.ppeZone)],
      ['Timestamp', new Date(this.active.time).toLocaleString()],
      ['Plant zone', this.active.zone],
      ['Worker', this.active.worker],
      ['Camera', this.active.camera],
      ['Severity', this.active.severity],
    ];
  }

  notDetectedLabel = notDetectedLabel;
  zoneTypeLabel = zoneTypeLabel;

  zoneBadgeClass(l: LogRow) {
    return isShockingZone(l.ppeZone, l.isImmediate)
      ? 'bg-destructive/15 text-destructive'
      : 'bg-sky-500/15 text-sky-800';
  }

  setType(t: string) {
    this.type = t;
    this.reload();
  }

  severityClass(severity: string) {
    if (severity === 'High' || severity === 'Critical') return 'bg-destructive/10 text-destructive';
    if (severity === 'Medium' || severity === 'Warning') return 'bg-amber-500/15 text-amber-700';
    return 'bg-accent text-accent-foreground';
  }

  exportExcel() {
    this.api
      .exportViolations({
        dateFrom: this.from,
        dateTo: this.to,
        violationType: this.type,
      })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `engro-violation-history-${this.from}_to_${this.to}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
          this.toast.success('Exported violation history');
        },
        error: (err: Error) => this.toast.show('Export failed', err.message),
      });
  }

  reset() {
    this.from = iso(new Date(Date.now() - 13 * 86400000));
    this.to = iso(new Date());
    this.type = 'All';
    this.reload();
  }

  reload() {
    this.loading = true;
    this.error = '';
    this.subs.add(
      this.api
        .getViolations({
          dateFrom: this.from,
          dateTo: this.to,
          violationType: this.type,
          page: 1,
          pageSize: 100,
        })
        .subscribe({
          next: (page) => {
            this.rows = shareSiblingSnapshots(page.items);
            this.totalCount = page.totalCount ?? page.items.length;
            this.loading = false;
            // Hydrate remaining gaps: detail → detection captures → camera captures.
            this.hydrateSnapshots(this.rows);
          },
          error: (err: Error) => {
            this.error = err.message || 'Failed to load violations.';
            this.loading = false;
          },
        }),
    );
  }

  /** Fill missing imagePath from violation detail, then captures API. */
  private hydrateSnapshots(rows: LogRow[]) {
    for (const row of rows) {
      if (row.imagePath) continue;
      this.subs.add(
        this.api.getViolation(row.id).subscribe({
          next: (detail) => {
            if (detail?.imagePath) {
              this.patchImage(row.id, detail.imagePath);
              return;
            }
            this.subs.add(
              this.api.getCapturesForDetection(row.id).subscribe({
                next: (urls) => {
                  if (urls[0]) {
                    this.patchImage(row.id, urls[0]);
                    return;
                  }
                  if (!row.camera) return;
                  this.subs.add(
                    this.api.getLatestCaptureUrl(row.camera).subscribe({
                      next: (url) => {
                        if (url) this.patchImage(row.id, url);
                      },
                    }),
                  );
                },
              }),
            );
          },
        }),
      );
    }
  }

  private patchImage(id: string, imagePath: string) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, imagePath } : r));
    if (this.active?.id === id) {
      this.active = { ...this.active, imagePath };
    }
  }
}
