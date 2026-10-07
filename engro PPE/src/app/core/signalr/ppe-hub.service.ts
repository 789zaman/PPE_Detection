import { Injectable, OnDestroy, inject } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ApiNotification } from '../models/ppe.models';
import { asRecord, mapCamera, mapNotifications, mapViolation } from '../api/mappers';
import { LogRow } from '../../lib/safety-data';
import { CameraInfo } from '../../components/camera-tile/camera-tile.component';

@Injectable({ providedIn: 'root' })
export class PpeHubService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private connection?: HubConnection;
  private starting?: Promise<void>;

  private readonly violationSubject = new Subject<LogRow>();
  private readonly cameraStatusSubject = new Subject<CameraInfo>();
  private readonly notificationSubject = new Subject<ApiNotification>();
  private readonly primaryCameraSubject = new Subject<{ cameraId: string; cameraCode: string }>();

  readonly violationReceived$ = this.violationSubject.asObservable();
  readonly cameraStatusUpdated$ = this.cameraStatusSubject.asObservable();
  readonly notificationReceived$ = this.notificationSubject.asObservable();
  readonly primaryCameraSwitched$ = this.primaryCameraSubject.asObservable();

  async start(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    if (this.connection?.state === HubConnectionState.Connected) return;
    if (this.starting) return this.starting;

    this.starting = this.connect().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    const conn = this.connection;
    this.connection = undefined;
    if (conn) await conn.stop();
  }

  ngOnDestroy() {
    void this.stop();
  }

  private async connect() {
    const hubToken = await new Promise<string>((resolve, reject) => {
      this.auth.issueHubToken().subscribe({ next: resolve, error: reject });
    });

    const url = `${environment.apiBaseUrl}/hubs/ppe-compliance?access_token=${encodeURIComponent(hubToken)}`;

    if (this.connection) {
      await this.connection.stop();
    }

    this.connection = new HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.on('ViolationReceived', (payload: unknown) => {
      const mapped = mapViolation(payload) ?? mapViolation(this.withLiveDefaults(payload));
      if (mapped) this.violationSubject.next(mapped);
    });

    this.connection.on('CameraStatusUpdated', (payload: unknown) => {
      this.cameraStatusSubject.next(mapCamera(payload));
    });

    this.connection.on('NotificationReceived', (payload: unknown) => {
      const [n] = mapNotifications([payload]);
      this.notificationSubject.next(n ?? {});
    });

    this.connection.on('PrimaryCameraSwitched', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const obj = payload as Record<string, unknown>;
      this.primaryCameraSubject.next({
        cameraId: String(obj['cameraId'] ?? ''),
        cameraCode: String(obj['cameraCode'] ?? ''),
      });
    });

    this.connection.onreconnected(() => {
      // Hub token may expire; reconnect path uses withAutomaticReconnect on same URL.
    });

    await this.connection.start();
  }

  /** Fill id/time so a live pulse still maps when the payload omits either field. */
  private withLiveDefaults(payload: unknown): unknown {
    const obj = asRecord(payload) ?? {};
    return {
      ...obj,
      id:
        obj['id'] ??
        obj['detectionLogId'] ??
        obj['DetectionLogId'] ??
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `live-${Date.now()}`),
      detectedAt: obj['detectedAt'] ?? obj['DetectedAt'] ?? new Date().toISOString(),
    };
  }
}
