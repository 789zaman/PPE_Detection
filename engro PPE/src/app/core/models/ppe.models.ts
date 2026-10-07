/** API snake_case enums (as returned by backend). */
export type ApiViolationType =
  | 'person'
  | 'goggles'
  | 'helmet'
  | 'arc_shield'
  | 'arc_suit'
  | 'arc_gloves'
  | 'boots'
  | string;

export type ApiSeverity = 'low' | 'medium' | 'high' | 'critical' | string;
export type ApiCameraStatus = 'online' | 'offline' | 'unknown' | string;

export type ApiDashboardLive = {
  primaryCamera?: Record<string, unknown> | null;
  latestAlerts?: unknown[];
  kpiSummary?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ApiDashboardStatistics = {
  totalViolationsToday?: number;
  totalDetectionsToday?: number;
  onlineCameras?: number;
  totalCameras?: number;
  unreadNotifications?: number;
  [key: string]: unknown;
};

export type ApiZone = {
  id?: string;
  name?: string;
  code?: string;
  [key: string]: unknown;
};

export type ApiNotification = {
  id?: string;
  title?: string;
  message?: string;
  body?: string;
  isRead?: boolean;
  status?: string;
  createdAt?: string;
  violationId?: string | null;
  severity?: ApiSeverity;
  [key: string]: unknown;
};

export type Paged<T> = {
  items: T[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
};
