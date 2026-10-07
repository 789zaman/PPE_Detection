import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope } from '../models/api.models';
import { ApiDashboardLive, ApiDashboardStatistics, ApiNotification, ApiZone, Paged } from '../models/ppe.models';
import { LogRow, TrendRow } from '../../lib/safety-data';
import {
  PageMeta,
  UiKpi,
  mapCameras,
  mapKpis,
  mapNotifications,
  mapTrends,
  mapViolation,
  mapViolations,
  normalizePaged,
  toApiViolationType,
} from './mappers';
import {
  CameraRoiZones,
  cacheCameraZones,
  emptyCameraZones,
  mapCameraRoiZones,
  readCachedCameraZones,
  toApiPolygonPayload,
} from './camera-zones';
import { resolveMediaUrl } from './media-url';

export type CameraStreamInfo = {
  id?: string;
  code: string;
  protocol?: string | null;
  whepUrl?: string | null;
  streamUrl?: string | null;
  videoUrl?: string | null;
  rtspUrl?: string | null;
  frameWidth?: number;
  frameHeight?: number;
};

export type PrimaryCameraView = {
  id: string;
  code: string;
  name: string;
  zoneName: string;
  status: string;
  /** MediaMTX WHEP URL when protocol=webrtc. */
  whepUrl?: string | null;
  /**
   * Browser-playable HTTP video (.mp4/.webm) when protocol=http.
   * RTSP is never played in the browser; use whepUrl for live NVR.
   */
  streamUrl?: string | null;
  /** Inference / stream pixel size from BE (same FOV as YOLO when main stream). */
  frameWidth?: number;
  frameHeight?: number;
  protocol?: string | null;
};

export type DashboardBundle = {
  compliance: string;
  kpis: UiKpi[];
  logs: LogRow[];
  trend: TrendRow[];
  statistics: ApiDashboardStatistics;
  primaryCamera: PrimaryCameraView | null;
};

@Injectable({ providedIn: 'root' })
export class PpeApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/ppe`;

  getDashboardBundle(): Observable<DashboardBundle> {
    return forkJoin({
      kpis: this.getKpis().pipe(catchError(() => of({ compliance: '0.0', items: [] as UiKpi[] }))),
      live: this.getLive().pipe(catchError(() => of({} as ApiDashboardLive))),
      alerts: this.getAlerts(1, 40).pipe(catchError(() => of({ items: [] as LogRow[], totalCount: 0 }))),
      trend: this.getTrends(14).pipe(catchError(() => of([] as TrendRow[]))),
      statistics: this.getStatistics().pipe(catchError(() => of({} as ApiDashboardStatistics))),
    }).pipe(
      map(({ kpis, live, alerts, trend, statistics }) => {
        const liveKpis = mapKpis(live['kpiSummary'] ?? live);
        const liveLogs = mapViolations(live['latestAlerts'] ?? live);
        const primary = this.mapPrimary(live['primaryCamera']);

        let compliance = kpis.items.length ? kpis.compliance : liveKpis.compliance;
        const detections = Number(statistics['totalDetectionsToday'] ?? 0);
        const violations = Number(statistics['totalViolationsToday'] ?? 0);
        if (detections > 0) {
          compliance = (((detections - violations) / detections) * 100).toFixed(1);
        }

        return {
          compliance,
          kpis: kpis.items.length ? kpis.items : liveKpis.items,
          logs: alerts.items.length ? alerts.items : liveLogs,
          trend,
          statistics,
          primaryCamera: primary,
        };
      }),
    );
  }

  getKpis() {
    return this.getData<unknown>(`${this.base}/dashboard/kpis`).pipe(map(mapKpis));
  }

  getLive() {
    return this.getData<ApiDashboardLive>(`${this.base}/dashboard/live`);
  }

  getAlerts(page = 1, pageSize = 20) {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.getPaged<LogRow>(`${this.base}/dashboard/alerts`, params, mapViolations);
  }

  getStatistics() {
    return this.getData<ApiDashboardStatistics>(`${this.base}/dashboard/statistics`);
  }

  getTrends(days = 14) {
    const params = new HttpParams().set('days', days);
    return this.getData<unknown>(`${this.base}/dashboard/trends`, params).pipe(map(mapTrends));
  }

  getCameras() {
    return this.getData<unknown>(`${this.base}/cameras`).pipe(map(mapCameras));
  }

  /** Raw camera records for Settings (includes zone + primary flags). */
  getCameraRecords() {
    return this.getData<unknown[]>(`${this.base}/cameras`).pipe(
      map((data) => (Array.isArray(data) ? data : []).map((row) => {
        const o = (row ?? {}) as Record<string, unknown>;
        return {
          id: String(o['id'] ?? ''),
          code: String(o['code'] ?? ''),
          name: String(o['name'] ?? ''),
          zoneId: String(o['zoneId'] ?? ''),
          zoneCode: String(o['zoneCode'] ?? ''),
          zoneName: String(o['zoneName'] ?? ''),
          status: String(o['status'] ?? 'offline'),
          isPrimary: o['isPrimary'] === true,
          isActive: o['isActive'] !== false,
          workerCount: Number(o['workerCount'] ?? 0),
        };
      })),
    );
  }

  upsertCamera(payload: {
    id?: string | null;
    code: string;
    name: string;
    zoneId: string;
    rtspUrl: string;
    streamUrl?: string | null;
    isPrimary?: boolean;
    isActive?: boolean;
  }) {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/cameras`, {
      id: payload.id || null,
      code: payload.code,
      name: payload.name,
      zoneId: payload.zoneId,
      rtspUrl: payload.rtspUrl,
      streamUrl: payload.streamUrl || null,
      isPrimary: payload.isPrimary ?? false,
      isActive: payload.isActive ?? true,
    });
  }

  upsertZone(payload: {
    id?: string | null;
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
  }) {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/cameras/zones`, {
      id: payload.id || null,
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      isActive: payload.isActive ?? true,
    });
  }

  getCameraStatus() {
    return this.getData<{
      total?: number;
      online?: number;
      offline?: number;
      cameras?: unknown[];
    }>(`${this.base}/cameras/status`).pipe(
      map((data) => ({
        total: Number(data?.total ?? 0),
        online: Number(data?.online ?? 0),
        offline: Number(data?.offline ?? 0),
        cameras: mapCameras(data?.cameras ?? data),
      })),
    );
  }

  getZones() {
    return this.getData<ApiZone[]>(`${this.base}/cameras/zones`).pipe(
      map((data) => (Array.isArray(data) ? data : [])),
    );
  }

  /**
   * Camera floor ROI shocking-zone polygons (0..N) in 1920×1080 pixels.
   * Tries GET /cameras/{code}/zones then falls back to / merges local cache.
   */
  getCameraRoiZones(cameraCode: string): Observable<CameraRoiZones> {
    const code = cameraCode.trim() || 'CAM-LIVE-01';
    const url = `${this.base}/cameras/${encodeURIComponent(code)}/zones`;
    return this.getData<unknown>(url).pipe(
      map((data) => {
        // API is the source of truth. Do not resurrect deleted polygons from localStorage.
        const fromApi = mapCameraRoiZones(data, code);
        cacheCameraZones(fromApi);
        return fromApi;
      }),
      catchError(() => {
        const cached = readCachedCameraZones(code);
        return of(cached ?? emptyCameraZones(code));
      }),
    );
  }

  /**
   * Save shocking-zone polygons via PUT /cameras/{code}/zones.
   *
   * BE stores the shock boundary in YellowZoneJson / RedZoneJson only
   * (`yellowZone` / `redZone` / `yellowPolygon` / `redPolygon`).
   * Do NOT PUT `{ shockingZones }` alone — STJ ignores unknown props, returns 200,
   * leaves columns empty → everyone OUTSIDE → no all-PPE alarms.
   *
   * Mapping: shockingZones[0] → yellowZone (primary shock boundary),
   *          shockingZones[1] → redZone (optional second).
   * Empty / <3 points is sent as an empty polygon so the BE column is cleared.
   */
  saveCameraRoiZones(zones: CameraRoiZones): Observable<CameraRoiZones> {
    const code = zones.cameraCode.trim() || 'CAM-LIVE-01';
    const drawable = zones.shockingZones.filter((z) => z.points.length >= 3);
    const url = `${this.base}/cameras/${encodeURIComponent(code)}/zones`;

    const yellowPts = drawable[0]?.points ?? [];
    const redPts = drawable[1]?.points ?? [];
    const yellowZone = toApiPolygonPayload(yellowPts) ?? { type: 'polygon' as const, points: [] as number[][] };
    const redZone = toApiPolygonPayload(redPts) ?? { type: 'polygon' as const, points: [] as number[][] };

    const body = {
      frameWidth: zones.frameWidth || 1920,
      frameHeight: zones.frameHeight || 1080,
      yellowZone,
      redZone,
      yellowPolygon: yellowPts.length >= 3 ? yellowPts : [],
      redPolygon: redPts.length >= 3 ? redPts : [],
    };

    return this.http.put<ApiEnvelope<unknown>>(url, body).pipe(
      map((res) => {
        if (res && typeof res === 'object' && 'success' in res && res.success === false) {
          throw new Error(res.message || 'Failed to save zones.');
        }
        const saved = mapCameraRoiZones(res?.data ?? body, code);
        cacheCameraZones(saved);
        return saved;
      }),
    );
  }

  /** Live stream playback info for a camera (GUID or code). */
  getCameraStream(idOrCode: string): Observable<CameraStreamInfo | null> {
    const key = idOrCode.trim();
    if (!key) return of(null);
    return this.getData<unknown>(`${this.base}/cameras/${encodeURIComponent(key)}/stream`).pipe(
      map((data) => this.mapStreamInfo(data, key)),
      catchError(() => of(null)),
    );
  }

  /** Latest capture/snapshot URL for a camera (violation captures reused as zone reference frames). */
  getLatestCaptureUrl(cameraCode: string): Observable<string | null> {
    const code = cameraCode.trim();
    if (!code) return of(null);
    const params = new HttpParams().set('cameraCode', code).set('page', 1).set('pageSize', 1);
    return this.getData<unknown>(`${this.base}/captures`, params).pipe(
      map((data) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: unknown[] } | null)?.items ?? []);
        const first = items[0];
        const o = first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
        if (!o) return null;
        const raw =
          (o['imageUrl'] as string | null | undefined) ||
          (o['storageKey'] as string | null | undefined) ||
          (o['imagePath'] as string | null | undefined) ||
          null;
        return resolveMediaUrl(raw?.trim() || null);
      }),
      catchError(() => of(null)),
    );
  }

  /**
   * Upload a JPEG/PNG snapshot for a camera (POST /captures multipart).
   * Returns the stored image URL when available.
   */
  uploadCameraCapture(blob: Blob, cameraCode: string, fileName = 'zone-frame.jpg'): Observable<string | null> {
    const code = cameraCode.trim();
    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('File', blob, fileName);
    form.append('cameraCode', code);
    form.append('CameraCode', code);

    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/captures`, form).pipe(
      map((res) => {
        if (res && typeof res === 'object' && 'success' in res && res.success === false) {
          throw new Error(res.message || 'Failed to upload snapshot.');
        }
        const data = (res?.data ?? res) as Record<string, unknown> | null;
        const raw =
          (data?.['imageUrl'] as string | null | undefined) ||
          (data?.['storageKey'] as string | null | undefined) ||
          (data?.['imagePath'] as string | null | undefined) ||
          null;
        return resolveMediaUrl(raw?.trim() || null);
      }),
      catchError((err: HttpErrorResponse) => {
        // Some BE builds expect JSON URL registration instead of multipart.
        if (err.status === 400 || err.status === 415) {
          return throwError(() => err);
        }
        return throwError(() => err);
      }),
    );
  }

  /** Prefer multipart upload; on failure register a data-/blob URL is not useful — rethrow. */
  saveCameraSnapshot(blob: Blob, cameraCode: string): Observable<string | null> {
    return this.uploadCameraCapture(blob, cameraCode).pipe(
      switchMap((url) => {
        if (url) return of(url);
        return of(null);
      }),
    );
  }

  private mapStreamInfo(raw: unknown, fallbackCode: string): CameraStreamInfo | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const nested =
      o['stream'] && typeof o['stream'] === 'object' ? (o['stream'] as Record<string, unknown>) : null;
    const code = String(o['code'] ?? o['cameraCode'] ?? nested?.['code'] ?? fallbackCode);
    return {
      id: o['id'] != null ? String(o['id']) : undefined,
      code,
      protocol: (o['protocol'] as string | null | undefined) ?? (nested?.['protocol'] as string | null) ?? null,
      whepUrl:
        (o['whepUrl'] as string | null | undefined) ??
        (nested?.['whepUrl'] as string | null | undefined) ??
        null,
      streamUrl:
        (o['streamUrl'] as string | null | undefined) ??
        (nested?.['url'] as string | null | undefined) ??
        null,
      videoUrl:
        (o['videoUrl'] as string | null | undefined) ??
        (nested?.['videoUrl'] as string | null | undefined) ??
        null,
      rtspUrl: (o['rtspUrl'] as string | null | undefined) ?? null,
      frameWidth: Number(o['frameWidth'] ?? nested?.['frameWidth'] ?? 0) || undefined,
      frameHeight: Number(o['frameHeight'] ?? nested?.['frameHeight'] ?? 0) || undefined,
    };
  }

  setPrimaryCamera(cameraId: string) {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.base}/cameras/${encodeURIComponent(cameraId)}/primary`,
      {},
    );
  }

  deleteCamera(cameraId: string) {
    return this.http.delete<ApiEnvelope<unknown>>(
      `${this.base}/cameras/${encodeURIComponent(cameraId)}`,
    );
  }

  getViolations(query: {
    dateFrom?: string;
    dateTo?: string;
    violationType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    let params = new HttpParams();
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params = params.set('dateTo', query.dateTo);
    if (query.violationType && query.violationType !== 'All') {
      params = params.set('violationType', toApiViolationType(query.violationType) ?? query.violationType);
    }
    if (query.search) params = params.set('search', query.search);
    params = params.set('page', query.page ?? 1).set('pageSize', query.pageSize ?? 60);
    return this.getPaged<LogRow>(`${this.base}/violations`, params, mapViolations);
  }

  getLatestViolations(take = 20) {
    const params = new HttpParams().set('take', take);
    return this.getData<unknown>(`${this.base}/violations/latest`, params).pipe(map(mapViolations));
  }

  getViolation(id: string) {
    return this.getData<unknown>(`${this.base}/violations/${encodeURIComponent(id)}`).pipe(
      map((data) => mapViolation(data)),
    );
  }

  /** Capture metadata (imageUrl / storageKey) linked to a detection, if any. */
  getCapturesForDetection(detectionLogId: string) {
    const params = new HttpParams()
      .set('detectionLogId', detectionLogId)
      .set('page', 1)
      .set('pageSize', 5);
    return this.getData<unknown>(`${this.base}/captures`, params).pipe(
      map((data) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: unknown[] } | null)?.items ?? []);
        return items
          .map((raw) => {
            const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
            if (!o) return null;
            const imageUrl =
              (o['imageUrl'] as string | null | undefined) ||
              (o['storageKey'] as string | null | undefined) ||
              null;
            return imageUrl?.trim() || null;
          })
          .filter((u): u is string => !!u);
      }),
    );
  }

  exportViolations(query: {
    dateFrom?: string;
    dateTo?: string;
    violationType?: string;
    search?: string;
  }) {
    let params = new HttpParams();
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params = params.set('dateTo', query.dateTo);
    if (query.violationType && query.violationType !== 'All') {
      params = params.set('violationType', toApiViolationType(query.violationType) ?? query.violationType);
    }
    if (query.search) params = params.set('search', query.search);

    return this.http.get(`${this.base}/violations/export`, {
      params,
      responseType: 'blob',
    });
  }

  getNotifications(page = 1, pageSize = 20) {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.getPaged<ApiNotification>(`${this.base}/notifications`, params, mapNotifications);
  }

  getUnreadCount() {
    return this.getData<{ count?: number }>(`${this.base}/notifications/unread-count`).pipe(
      map((data) => Number(data?.count ?? 0)),
    );
  }

  markNotificationRead(id: string) {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.base}/notifications/${encodeURIComponent(id)}/read`,
      {},
    );
  }

  acknowledgeNotification(id: string) {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.base}/notifications/${encodeURIComponent(id)}/acknowledge`,
      {},
    );
  }

  resolveNotification(id: string) {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.base}/notifications/${encodeURIComponent(id)}/resolve`,
      {},
    );
  }

  markAllNotificationsRead() {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/notifications/read-all`, {});
  }

  private mapPrimary(raw: unknown): PrimaryCameraView | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const id = String(o['id'] ?? '');
    const code = String(o['code'] ?? '');
    if (!id && !code) return null;
    const stream = o['stream'] && typeof o['stream'] === 'object'
      ? (o['stream'] as Record<string, unknown>)
      : null;
    const whepUrl =
      (o['whepUrl'] as string | null | undefined) ??
      (stream?.['whepUrl'] as string | null | undefined) ??
      null;
    const streamUrl =
      (o['videoUrl'] as string | null | undefined) ??
      (o['streamUrl'] as string | null | undefined) ??
      (stream?.['url'] as string | null | undefined) ??
      (stream?.['videoUrl'] as string | null | undefined) ??
      null;
    const frameWidth = Number(o['frameWidth'] ?? stream?.['frameWidth'] ?? 0) || undefined;
    const frameHeight = Number(o['frameHeight'] ?? stream?.['frameHeight'] ?? 0) || undefined;

    return {
      id,
      code,
      name: String(o['name'] ?? code),
      zoneName: String(o['zoneName'] ?? ''),
      status: String(o['status'] ?? 'offline'),
      whepUrl,
      streamUrl,
      frameWidth,
      frameHeight,
      protocol: (o['protocol'] as string | null | undefined) ?? null,
    };
  }

  private getData<T>(url: string, params?: HttpParams): Observable<T> {
    return this.http.get<ApiEnvelope<T>>(url, { params }).pipe(
      map((res) => {
        if (res && typeof res === 'object' && 'data' in res) {
          if (res.success === false) throw new Error(res.message || 'Request failed.');
          return res.data;
        }
        return res as unknown as T;
      }),
    );
  }

  private getPaged<T>(
    url: string,
    params: HttpParams,
    mapItems: (data: unknown) => T[],
  ): Observable<Paged<T>> {
    return this.http.get<ApiEnvelope<unknown>>(url, { params }).pipe(
      map((res) => {
        if (res?.success === false) throw new Error(res.message || 'Request failed.');
        // Paged lists: items in data[], pagination in meta
        const paged = normalizePaged<unknown>(res?.data, res?.meta as PageMeta | null);
        return {
          ...paged,
          items: mapItems(paged.items.length ? paged.items : res?.data),
        };
      }),
    );
  }
}
