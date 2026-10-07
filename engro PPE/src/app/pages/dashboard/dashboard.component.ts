import { Component, OnDestroy, OnInit } from '@angular/core';
import { HardHat, Hand, Glasses, Zap, Footprints, Shield, LucideIconData } from 'lucide-angular';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { CameraStreamComponent } from '../../components/camera-stream/camera-stream.component';
import { AlertFeedComponent } from '../../components/alert-feed/alert-feed.component';
import { StatCardComponent } from '../../components/stat-card/stat-card.component';
import { TrendChartComponent } from '../../components/trend-chart/trend-chart.component';
import { ComplianceChartComponent } from '../../components/compliance-chart/compliance-chart.component';
import { LogTableComponent } from '../../components/log-table/log-table.component';
import { LogRow, TrendRow, ViolationType, collapseOpenViolationSessions, mergeLiveViolation, shareSiblingSnapshots, liveAlarms, latestIngestByWorker, ingestWorkerKey, isPpeAlarm, workerHasLeft, violationSessionWorkerKey, VIOLATION_SESSION_GAP_MS } from '../../lib/safety-data';
import { PpeApiService, PrimaryCameraView } from '../../core/api/ppe-api.service';
import { ApiDashboardStatistics } from '../../core/models/ppe.models';
import { PpeHubService } from '../../core/signalr/ppe-hub.service';
import { UiKpi, toDetectionOverlay } from '../../core/api/mappers';
import { DetectionOverlay } from '../../core/api/bounding-boxes';
import { CameraRoiZones } from '../../core/api/camera-zones';
import { ViolationAlarmService } from '../../services/violation-alarm.service';

type Stat = {
  label: string;
  type: ViolationType;
  icon: LucideIconData;
  count: number;
  percent: number;
  delta: number;
};

type TrendField = 'Helmet' | 'Gloves' | 'Glasses' | 'ArcFlash' | 'ArcShield' | 'Boots';

const TREND_FIELD: Record<ViolationType, TrendField> = {
  Helmet: 'Helmet',
  Gloves: 'Gloves',
  'Safety Glasses': 'Glasses',
  'Arc Flash Suit': 'ArcFlash',
  'Arc Flash Shield': 'ArcShield',
  Boots: 'Boots',
};

const KPI_REFRESH_MS = 800;

const ICONS: Record<ViolationType, LucideIconData> = {
  Helmet: HardHat,
  Gloves: Hand,
  'Safety Glasses': Glasses,
  'Arc Flash Suit': Zap,
  'Arc Flash Shield': Shield,
  Boots: Footprints,
};

/** Keep person overlay until leave/reset; drop if ingest goes quiet. */
const OVERLAY_TTL_MS = 2500;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    SiteHeaderComponent,
    CameraStreamComponent,
    AlertFeedComponent,
    StatCardComponent,
    TrendChartComponent,
    ComplianceChartComponent,
    LogTableComponent,
  ],
  template: `
    <main class="min-h-screen bg-transparent">
      <div class="sticky top-0 z-30">
        <app-site-header [compliance]="compliance"></app-site-header>
      </div>

      <div class="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        @if (loading) {
          <p class="text-sm text-muted-foreground">Loading live dashboard…</p>
        } @else if (error) {
          <div class="surface-card p-4 text-sm text-destructive">{{ error }}</div>
        }

        <section class="grid gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <app-camera-stream
              [primary]="primaryCamera"
              [detections]="bypassOn ? [] : overlayDetections"
              [zones]="bypassOn ? null : cameraZones"
            ></app-camera-stream>
          </div>
          <app-alert-feed [logs]="alertLogs"></app-alert-feed>
        </section>

        <section class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          @for (s of stats; track s.type; let i = $index) {
            <app-stat-card
              [label]="s.label"
              [icon]="s.icon"
              [count]="s.count"
              [percent]="s.percent"
              [delta]="s.delta"
              [delay]="i * 90"
            ></app-stat-card>
          }
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
          <app-trend-chart [data]="trend"></app-trend-chart>
          <app-compliance-chart [data]="trend"></app-compliance-chart>
        </section>

        <app-log-table [logs]="logs"></app-log-table>
      </div>
    </main>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  logs: LogRow[] = [];
  trend: TrendRow[] = [];
  stats: Stat[] = [];
  compliance = '0.0';
  primaryCamera: PrimaryCameraView | null = null;
  overlayDetections: DetectionOverlay[] = [];
  cameraZones: CameraRoiZones | null = null;
  loading = true;
  error = '';
  bypassOn = false;
  private subs = new Subscription();
  private overlayTtlTimer?: ReturnType<typeof setInterval>;
  /** Detection ids already applied to KPI cards (avoids double-count on replay). */
  private countedKpiIds = new Set<string>();
  /** Duplicate live pulses must not bump KPI again for the same open session. */
  private countedKpiSessions = new Map<string, number>();
  private kpiRefreshTimer?: ReturnType<typeof setTimeout>;
  private todayDetections = 0;
  private todayViolations = 0;

  /**
   * PPE violations for the Violation Alerts panel only.
   * Grouped by (workerCode, violationType, open session) so pre-fix
   * duplicate detection rows do not spam the live feed.
   * Alarm rules / zone labels unchanged.
   */
  get alertLogs() {
    // Bypass: hide live violation alerts during no-PPE activity windows.
    if (this.bypassOn) return [];
    return collapseOpenViolationSessions(liveAlarms(this.logs));
  }

  constructor(
    private api: PpeApiService,
    private hub: PpeHubService,
    private alarm: ViolationAlarmService,
  ) {}

  ngOnInit() {
    document.title = 'Engro Fertilizer PPE Safety Monitor | Live Violation Dashboard';
    this.bypassOn = this.alarm.bypassEnabled;
    this.load();
    void this.hub.start();
    this.overlayTtlTimer = setInterval(() => this.rebuildOverlays(), 500);
    this.subs.add(
      this.alarm.bypass$.subscribe((on) => {
        this.bypassOn = on;
        if (on) {
          this.overlayDetections = [];
          this.alarm.syncFromLogs(this.logs);
        } else {
          this.rebuildOverlays();
        }
      }),
    );
    this.subs.add(
      this.hub.violationReceived$.subscribe((l) => {
        if (this.bypassOn) {
          this.alarm.syncFromLogs(this.logs);
          return;
        }
        this.logs = shareSiblingSnapshots(mergeLiveViolation(this.logs, l).slice(0, 60));
        this.applyLiveViolationToCards(l);
        this.ingestOverlayFromLog(l);
        this.alarm.noteLive(l);
        this.alarm.syncFromLogs(this.logs);
      }),
    );
    this.subs.add(
      this.hub.primaryCameraSwitched$.subscribe((evt) => {
        // Refresh live payload so streamUrl (local video) updates for the new primary
        this.subs.add(
          this.api.getLive().subscribe({
            next: (live) => {
              const cam = live?.primaryCamera as Record<string, unknown> | null | undefined;
              if (cam && typeof cam === 'object') {
                const stream =
                  cam['stream'] && typeof cam['stream'] === 'object'
                    ? (cam['stream'] as Record<string, unknown>)
                    : null;
                this.primaryCamera = {
                  id: String(cam['id'] ?? evt.cameraId ?? ''),
                  code: String(cam['code'] ?? evt.cameraCode ?? ''),
                  name: String(cam['name'] ?? cam['code'] ?? evt.cameraCode ?? ''),
                  zoneName: String(cam['zoneName'] ?? ''),
                  status: String(cam['status'] ?? 'online'),
                  whepUrl:
                    (cam['whepUrl'] as string | null | undefined) ??
                    (stream?.['whepUrl'] as string | null | undefined) ??
                    null,
                  streamUrl: (cam['streamUrl'] as string | null | undefined) ?? null,
                  frameWidth: Number(cam['frameWidth'] ?? stream?.['frameWidth'] ?? 0) || undefined,
                  frameHeight: Number(cam['frameHeight'] ?? stream?.['frameHeight'] ?? 0) || undefined,
                  protocol: (cam['protocol'] as string | null | undefined) ?? null,
                };
              } else {
                this.primaryCamera = {
                  id: evt.cameraId,
                  code: evt.cameraCode,
                  name: evt.cameraCode,
                  zoneName: this.primaryCamera?.zoneName ?? '',
                  status: 'online',
                  whepUrl: null,
                  streamUrl: null,
                  frameWidth: this.primaryCamera?.frameWidth,
                  frameHeight: this.primaryCamera?.frameHeight,
                };
              }
              this.loadCameraZones(this.primaryCamera.code || evt.cameraCode);
              this.rebuildOverlays();
            },
          }),
        );
      }),
    );
  }

  private loadCameraZones(code: string) {
    this.subs.add(
      this.api.getCameraRoiZones(code || 'CAM-LIVE-01').subscribe({
        next: (z) => (this.cameraZones = z),
      }),
    );
  }

  ngOnDestroy() {
    if (this.overlayTtlTimer) clearInterval(this.overlayTtlTimer);
    if (this.kpiRefreshTimer) clearTimeout(this.kpiRefreshTimer);
    this.subs.unsubscribe();
  }

  private load() {
    this.loading = true;
    this.error = '';
    this.subs.add(
      this.api.getDashboardBundle().subscribe({
        next: (bundle) => {
          // Collapse open sessions on poll so historical duplicate rows are not live spam.
          this.logs = shareSiblingSnapshots(collapseOpenViolationSessions(bundle.logs).slice(0, 60));
          this.trend = bundle.trend;
          this.compliance = bundle.compliance || '0.0';
          this.primaryCamera = bundle.primaryCamera;
          this.todayDetections = Number(bundle.statistics['totalDetectionsToday'] ?? 0);
          this.todayViolations = Number(bundle.statistics['totalViolationsToday'] ?? 0);
          this.countedKpiIds = new Set(this.logs.map((l) => l.id));
          this.countedKpiSessions.clear();
          for (const l of this.logs) {
            if (!isPpeAlarm(l)) continue;
            const t = Date.parse(l.time) || 0;
            const key = violationSessionWorkerKey(l);
            const prev = this.countedKpiSessions.get(key) ?? 0;
            if (t >= prev) this.countedKpiSessions.set(key, t);
          }
          this.stats = this.toStats(bundle.kpis);
          if (!this.stats.length) this.applyKpiFallbackFromLogs();
          this.ensureStatCards();
          this.loading = false;
          this.loadCameraZones(bundle.primaryCamera?.code || 'CAM-LIVE-01');
          if (!this.bypassOn) {
            this.rebuildOverlays();
            this.alarm.armFromLiveLogs(this.logs);
          } else {
            this.overlayDetections = [];
          }
        },
        error: (err: Error) => {
          this.error = err.message || 'Failed to load dashboard.';
          this.loading = false;
        },
      }),
    );
  }

  /**
   * Latest ingest person box per workerCode. Leave/reset (no boxes) drops that S-N.
   * Helmet-missing styling only when the latest row is an actual helmet alarm.
   */
  private rebuildOverlays() {
    if (this.bypassOn) {
      this.overlayDetections = [];
      this.alarm.syncFromLogs(this.logs);
      return;
    }
    const cam = this.primaryCamera?.code;
    const now = Date.now();
    const latest = [...latestIngestByWorker(this.logs).values()]
      .filter((l) => !cam || l.camera === cam || l.camera === this.primaryCamera?.name)
      .filter((l) => !workerHasLeft(l))
      .filter((l) => {
        const t = Date.parse(l.time);
        if (!Number.isFinite(t)) return false;
        return now - t <= OVERLAY_TTL_MS;
      });

    const camFw = this.primaryCamera?.frameWidth;
    const camFh = this.primaryCamera?.frameHeight;
    const overlays: DetectionOverlay[] = [];
    const seen = new Set<string>();
    for (const row of latest) {
      const key = ingestWorkerKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const o = toDetectionOverlay(row);
      if (!o) continue;
      if (!o.frameWidth && camFw) o.frameWidth = camFw;
      if (!o.frameHeight && camFh) o.frameHeight = camFh;
      overlays.push(o);
    }
    this.overlayDetections = overlays;
    this.alarm.syncFromLogs(this.logs);
  }

  private ingestOverlayFromLog(row: LogRow) {
    if (this.bypassOn) return;
    this.rebuildOverlays();
  }

  private toStats(items: UiKpi[]): Stat[] {
    return items.map((k) => ({
      label: k.label,
      type: k.type,
      icon: ICONS[k.type] ?? HardHat,
      count: k.count,
      percent: k.percent,
      delta: k.delta,
    }));
  }

  /** Empty KPI API: seed cards from current violation logs. */
  private applyKpiFallbackFromLogs() {
    const violations = liveAlarms(this.logs);
    const total = violations.length || 1;
    const c = (t: ViolationType) => violations.filter((l) => l.type === t).length;
    this.stats = (Object.keys(ICONS) as ViolationType[]).map((type) => ({
      label: `${type} Violations`,
      type,
      icon: ICONS[type],
      count: c(type),
      percent: (c(type) / total) * 100,
      delta: 0,
    }));
  }

  private emptyStats(): Stat[] {
    return (Object.keys(ICONS) as ViolationType[]).map((type) => ({
      label: `${type} Violations`,
      type,
      icon: ICONS[type],
      count: 0,
      percent: 0,
      delta: 0,
    }));
  }

  private ensureStatCards() {
    if (!this.stats.length) {
      this.stats = this.emptyStats();
      return;
    }
    const have = new Set(this.stats.map((s) => s.type));
    const missing = (Object.keys(ICONS) as ViolationType[]).filter((t) => !have.has(t));
    if (!missing.length) return;
    this.stats = [
      ...this.stats,
      ...missing.map((type) => ({
        label: `${type} Violations`,
        type,
        icon: ICONS[type],
        count: 0,
        percent: 0,
        delta: 0,
      })),
    ];
  }

  /**
   * Instant card/trend bump on each unique PPE violation, then debounce
   * a KPI/statistics refresh so rates match the backend.
   */
  private applyLiveViolationToCards(row: LogRow) {
    if (workerHasLeft(row)) {
      const wk = ingestWorkerKey(row);
      for (const key of [...this.countedKpiSessions.keys()]) {
        if (key.startsWith(`${wk}::`)) this.countedKpiSessions.delete(key);
      }
      return;
    }
    if (!isPpeAlarm(row)) return;
    const session = violationSessionWorkerKey(row);
    const t = Date.parse(row.time) || Date.now();
    const prev = this.countedKpiSessions.get(session);
    if (prev != null && t - prev <= VIOLATION_SESSION_GAP_MS) return;
    if (this.countedKpiIds.has(row.id)) return;
    this.countedKpiIds.add(row.id);
    this.countedKpiSessions.set(session, t);

    this.ensureStatCards();
    this.stats = this.stats.map((s) => (s.type === row.type ? this.incrementStat(s) : s));

    this.todayDetections += 1;
    this.todayViolations += 1;
    this.recomputeCompliance();
    this.bumpTodayTrend(row.type);
    this.scheduleKpiRefresh();
  }

  private incrementStat(stat: Stat): Stat {
    const count = stat.count + 1;
    let percent = stat.percent;
    if (stat.percent > 0 && stat.count > 0) {
      const entries = stat.count / (stat.percent / 100);
      if (entries > 0) percent = (count / entries) * 100;
    }
    return { ...stat, count, percent };
  }

  private recomputeCompliance() {
    if (this.todayDetections <= 0) return;
    const v = Math.min(this.todayViolations, this.todayDetections);
    this.compliance = (((this.todayDetections - v) / this.todayDetections) * 100).toFixed(1);
  }

  private bumpTodayTrend(type: ViolationType) {
    if (!this.trend.length) return;
    const field = TREND_FIELD[type];
    const todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const idx = this.trend.findIndex((row) => row.date === todayLabel);
    const target = idx >= 0 ? idx : this.trend.length - 1;
    this.trend = this.trend.map((row, i) => {
      if (i !== target) return row;
      const nextCount = row[field] + 1;
      return { ...row, [field]: nextCount, total: row.total + 1 };
    });
  }

  private scheduleKpiRefresh() {
    if (this.kpiRefreshTimer) clearTimeout(this.kpiRefreshTimer);
    this.kpiRefreshTimer = setTimeout(() => this.refreshKpisFromApi(), KPI_REFRESH_MS);
  }

  private refreshKpisFromApi() {
    this.subs.add(
      forkJoin({
        kpis: this.api.getKpis().pipe(catchError(() => of({ compliance: this.compliance, items: [] as UiKpi[] }))),
        statistics: this.api.getStatistics().pipe(catchError(() => of({} as ApiDashboardStatistics))),
        trend: this.api.getTrends(14).pipe(catchError(() => of(this.trend))),
      }).subscribe({
        next: ({ kpis, statistics, trend }) => {
          if (kpis.items.length) this.stats = this.toStats(kpis.items);
          this.ensureStatCards();
          this.todayDetections = Number(statistics['totalDetectionsToday'] ?? this.todayDetections);
          this.todayViolations = Number(statistics['totalViolationsToday'] ?? this.todayViolations);
          const detections = this.todayDetections;
          const violations = this.todayViolations;
          if (detections > 0) {
            this.compliance = (((detections - violations) / detections) * 100).toFixed(1);
          } else if (kpis.items.length) {
            this.compliance = kpis.compliance || this.compliance;
          }
          if (trend.length) this.trend = trend;
        },
      }),
    );
  }
}
