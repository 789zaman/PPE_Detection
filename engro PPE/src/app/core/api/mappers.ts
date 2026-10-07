import { LogRow, TrendRow, ViolationType, isPpeAlarm } from '../../lib/safety-data';
import { CameraInfo } from '../../components/camera-tile/camera-tile.component';
import { ApiNotification, Paged } from '../models/ppe.models';
import { AuthUser } from '../models/api.models';
import {
  DetectionOverlay,
  detectionLabel,
  detectionState,
  parseBoundingBoxes,
  personBoxesOnly,
} from './bounding-boxes';
import { mapPpeZone } from './camera-zones';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function pickString(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj) return '';
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

export function pickBool(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): boolean | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
    }
  }
  return undefined;
}

export function pickNumber(obj: Record<string, unknown> | null | undefined, ...keys: string[]): number {
  if (!obj) return 0;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

export function pickArray<T = unknown>(value: unknown, ...keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  const obj = asRecord(value);
  if (!obj) return [];
  for (const key of keys) {
    const v = obj[key];
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export type PageMeta = {
  pageNumber?: number;
  pageSize?: number;
  totalRecords?: number;
  totalPages?: number;
};

export function normalizePaged<T>(data: unknown, meta?: PageMeta | null): Paged<T> {
  const items = (Array.isArray(data) ? data : pickArray<T>(data, 'items', 'cameras', 'series')) as T[];
  const m = asRecord(meta);
  return {
    items,
    page: pickNumber(m, 'pageNumber', 'page') || undefined,
    pageSize: pickNumber(m, 'pageSize') || undefined,
    totalCount: pickNumber(m, 'totalRecords', 'totalCount', 'total') || items.length,
    totalPages: pickNumber(m, 'totalPages') || undefined,
  };
}

const VIOLATION_LABEL: Record<string, ViolationType> = {
  helmet: 'Helmet',
  gloves: 'Gloves',
  glove: 'Gloves',
  arc_gloves: 'Gloves',
  arcgloves: 'Gloves',
  safety_glasses: 'Safety Glasses',
  safetyglasses: 'Safety Glasses',
  glasses: 'Safety Glasses',
  goggles: 'Safety Glasses',
  arc_flash_suit: 'Arc Flash Suit',
  arcflashsuit: 'Arc Flash Suit',
  arc_suit: 'Arc Flash Suit',
  arcsuit: 'Arc Flash Suit',
  suit: 'Arc Flash Suit',
  // Peer YOLO class to arc_suit (model name: arc_shield)
  arc_flash_shield: 'Arc Flash Shield',
  arcflashshield: 'Arc Flash Shield',
  arc_shield: 'Arc Flash Shield',
  arcshield: 'Arc Flash Shield',
  face_shield: 'Arc Flash Shield',
  faceshield: 'Arc Flash Shield',
  // Legacy BE enum slot name still appears in older payloads / KPI keys
  vest: 'Arc Flash Shield',
  safety_vest: 'Arc Flash Shield',
  safetyvest: 'Arc Flash Shield',
  boots: 'Boots',
  no_boots: 'Boots',
  noboots: 'Boots',
  boot: 'Boots',
  shoe: 'Boots',
  shoes: 'Boots',
};

/**
 * Query-string value for GET /violations?violationType=…
 * ASP.NET query binding uses enum member names (or ints), not JSON snake_case.
 */
export function toApiViolationType(label: string): string | undefined {
  const map: Record<string, string> = {
    Helmet: 'Helmet',
    Gloves: 'Gloves',
    'Safety Glasses': 'SafetyGlasses',
    'Arc Flash Suit': 'ArcFlashSuit',
    'Arc Flash Shield': 'Vest', // BE enum member; plant meaning = arc flash shield
    'Arc Shield': 'Vest',
    Boots: 'Boots',
    helmet: 'Helmet',
    goggles: 'SafetyGlasses',
    arc_gloves: 'Gloves',
    gloves: 'Gloves',
    arc_suit: 'ArcFlashSuit',
    arc_shield: 'Vest',
    boots: 'Boots',
    'safety glasses': 'SafetyGlasses',
    arc_flash_suit: 'ArcFlashSuit',
    'arc flash suit': 'ArcFlashSuit',
    arc_flash_shield: 'Vest',
    'arc flash shield': 'Vest',
    'arc shield': 'Vest',
    vest: 'Vest',
  };
  const key = String(label ?? '').trim();
  return map[key] ?? map[key.toLowerCase()];
}

function isPersonTypeLabel(raw: unknown): boolean {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return key === 'person' || key === 'people' || key === '0';
}

/** Map API / model labels; prefer missingPpe so titles match the real breach. */
export function mapViolationType(raw: unknown, missingPpe?: string | null): ViolationType | null {
  if (isPersonTypeLabel(raw)) return null;

  const YOLO_ID_TO_TYPE: Record<number, ViolationType> = {
    1: 'Safety Glasses', // goggles
    2: 'Helmet',
    3: 'Arc Flash Shield',
    4: 'Arc Flash Suit',
    5: 'Gloves', // arc_gloves
    6: 'Boots',
  };
  if (typeof raw === 'number' && YOLO_ID_TO_TYPE[raw]) {
    return YOLO_ID_TO_TYPE[raw];
  }
  const asNum = Number(String(raw ?? '').trim());
  if (Number.isInteger(asNum) && YOLO_ID_TO_TYPE[asNum]) {
    return YOLO_ID_TO_TYPE[asNum];
  }

  // missingPpe first — BE may store shield as Vest enum, gloves as Gloves, etc.
  const candidates = [missingPpe, raw]
    .map((v) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_'),
    )
    .filter((key) => key && !isPersonTypeLabel(key));

  for (const key of candidates) {
    const hit = VIOLATION_LABEL[key] ?? VIOLATION_LABEL[key.replace(/_/g, '')];
    if (hit) return hit;
  }

  return null;
}

export function mapSeverity(raw: unknown): LogRow['severity'] {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (key === 'low') return 'Low';
  if (key === 'medium') return 'Medium';
  if (key === 'warning' || key === 'warn') return 'Warning';
  if (key === 'critical' || key === 'crit') return 'Critical';
  if (key === 'high') return 'High';
  return 'High';
}

export function mapConfidence(obj: Record<string, unknown>): number {
  let value = pickNumber(obj, 'confidence');
  if (value > 0 && value <= 1) value = Math.round(value * 100);
  return Math.round(value || 0);
}

/** Maps ViolationListItem / ViolationReceived / alert / detail rows. */
export function mapViolation(raw: unknown): LogRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const id = pickString(obj, 'id', 'detectionLogId', 'DetectionLogId');
  const time =
    pickString(obj, 'detectedAt', 'DetectedAt', 'detectionTime', 'createdAt') ||
    new Date().toISOString();
  if (!id) return null;

  const isViolation = obj['isViolation'] === undefined ? true : obj['isViolation'] === true;
  const missingPpe = pickString(obj, 'missingPpe') || undefined;
  const typeRaw = obj['violationType'] ?? obj['ppeType'];
  const ppeType = isPersonTypeLabel(typeRaw) ? null : mapViolationType(typeRaw, missingPpe);

  // Person / unknown class: overlay only. Never invent a Helmet miss.
  if (!ppeType) {
    if (isPersonTypeLabel(typeRaw) || isViolation === false) {
      const frameWidth = pickNumber(obj, 'frameWidth', 'imageWidth', 'sourceWidth') || undefined;
      const frameHeight = pickNumber(obj, 'frameHeight', 'imageHeight', 'sourceHeight') || undefined;
      const boxes = parseBoundingBoxes(obj['boundingBoxes'] ?? obj['BoundingBoxes'], {
        fallbackClass: 'person',
        frameWidth,
        frameHeight,
      });
      return {
        id,
        time,
        type: 'Person',
        zone: pickString(obj, 'zoneName') || 'Unknown zone',
        ppeZone: mapPpeZone(
          obj['ppeZone'] ?? obj['zoneClassification'] ?? obj['dangerZone'] ?? obj['roiZone'],
        ),
        worker: pickString(obj, 'workerName') || pickString(obj, 'workerCode') || 'Unknown',
        workerCode: pickString(obj, 'workerCode') || null,
        camera: pickString(obj, 'cameraCode', 'cameraName') || 'CAM',
        severity: mapSeverity(obj['severity']),
        confidence: mapConfidence(obj),
        boundingBoxes: boxes.length ? boxes : undefined,
        isViolation: false,
        helmetDetected: pickBool(obj, 'helmetDetected', 'HelmetDetected'),
        missingPpe: undefined,
        frameWidth,
        frameHeight,
        imagePath:
          pickString(obj, 'imagePath', 'thumbnailPath', 'ImagePath', 'imageUrl', 'storageKey') || null,
      };
    }
    return null;
  }

  const type = ppeType;
  const displayMissing =
    missingPpe && !/^vest$/i.test(missingPpe.trim())
      ? missingPpe
      : type === 'Arc Flash Shield'
        ? 'Arc Flash Shield'
        : missingPpe;
  const frameWidth = pickNumber(obj, 'frameWidth', 'imageWidth', 'sourceWidth') || undefined;
  const frameHeight = pickNumber(obj, 'frameHeight', 'imageHeight', 'sourceHeight') || undefined;
  const boxes = parseBoundingBoxes(obj['boundingBoxes'] ?? obj['BoundingBoxes'], {
    fallbackClass: 'person',
    frameWidth,
    frameHeight,
  });
  const confidence = mapConfidence(obj);
  // Only accept explicit ROI classification — never treat plant zoneName as OUTSIDE badge.
  const ppeZone = mapPpeZone(
    obj['ppeZone'] ??
      obj['zoneClassification'] ??
      obj['dangerZone'] ??
      obj['roiZone'] ??
      obj['floorZone'],
  );
  const plantZone = pickString(obj, 'zoneName') || 'Unknown zone';
  const immediateRaw = obj['isImmediate'] ?? obj['immediate'] ?? obj['violationTiming'];
  const isImmediate =
    immediateRaw === true ||
    String(immediateRaw ?? '')
      .trim()
      .toUpperCase() === 'IMMEDIATE' ||
    ppeZone === 'SHOCKING';
  // Shocking-zone PPE class violations are always immediate → Critical.
  const severity =
    ppeZone === 'SHOCKING' || isImmediate ? 'Critical' : mapSeverity(obj['severity']);

  return {
    id,
    time,
    type,
    zone: /outside/i.test(plantZone) ? 'Unknown zone' : plantZone,
    ppeZone,
    isImmediate,
    worker: pickString(obj, 'workerName') || pickString(obj, 'workerCode') || 'Unknown',
    workerCode: pickString(obj, 'workerCode') || null,
    camera: pickString(obj, 'cameraCode', 'cameraName') || 'CAM',
    severity,
    confidence,
    boundingBoxes: boxes.length ? boxes : undefined,
    isViolation,
    helmetDetected: pickBool(obj, 'helmetDetected', 'HelmetDetected'),
    missingPpe: displayMissing,
    frameWidth,
    frameHeight,
    imagePath:
      pickString(obj, 'imagePath', 'thumbnailPath', 'ImagePath', 'imageUrl', 'storageKey') || null,
  };
}

export function mapViolations(value: unknown): LogRow[] {
  return pickArray(value, 'latestAlerts', 'items', 'alerts')
    .map((v) => mapViolation(v))
    .filter((v): v is LogRow => !!v);
}

export function toDetectionOverlay(row: LogRow): DetectionOverlay | null {
  const boxes = personBoxesOnly(row.boundingBoxes);
  if (!boxes.length) return null;
  const alarming =
    isPpeAlarm(row) && !(row.type === 'Helmet' && row.helmetDetected === true);
  return {
    id: row.id,
    label: detectionLabel({
      missingPpe: alarming ? row.missingPpe : undefined,
      type: alarming ? row.type : undefined,
      isViolation: alarming,
    }),
    confidence: 0,
    state: detectionState({ isViolation: alarming, severity: row.severity }),
    boxes,
    camera: row.camera,
    worker: row.worker,
    time: row.time,
    frameWidth: row.frameWidth,
    frameHeight: row.frameHeight,
    fallbackClassKey: 'person',
  };
}

export function mapTrendPoint(raw: unknown): TrendRow {
  const obj = asRecord(raw) ?? {};
  const dateRaw = pickString(obj, 'date');
  const parsed = dateRaw ? new Date(dateRaw) : null;
  const date =
    parsed && !Number.isNaN(+parsed)
      ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : dateRaw || '—';

  const Helmet = pickNumber(obj, 'helmet', 'Helmet');
  const Gloves = pickNumber(obj, 'gloves', 'Gloves');
  const Glasses = pickNumber(obj, 'safetyGlasses', 'SafetyGlasses');
  const ArcFlash = pickNumber(obj, 'arcFlashSuit', 'ArcFlashSuit');
  const ArcShield = pickNumber(
    obj,
    'arcFlashShield',
    'ArcFlashShield',
    'arcShield',
    'ArcShield',
    'vest',
    'Vest',
  );
  const Boots = pickNumber(obj, 'boots', 'Boots');
  const total =
    pickNumber(obj, 'total', 'Total') ||
    Helmet + Gloves + Glasses + ArcFlash + ArcShield + Boots;

  return { date, Helmet, Gloves, Glasses, ArcFlash, ArcShield, Boots, total };
}

export function mapTrends(value: unknown): TrendRow[] {
  const obj = asRecord(value);
  const series = pickArray(obj ?? value, 'series');
  return series.map(mapTrendPoint);
}

export function mapCamera(raw: unknown, index = 0): CameraInfo {
  const obj = asRecord(raw) ?? {};
  const code = pickString(obj, 'code', 'cameraCode');
  const id = code || pickString(obj, 'name') || `CAM-${String(index + 1).padStart(2, '0')}`;
  const statusRaw = pickString(obj, 'status').toLowerCase();
  const online = statusRaw === 'online';
  return {
    id,
    zone: pickString(obj, 'zoneName', 'zoneCode') || 'Unassigned',
    status: online ? 'online' : 'offline',
    hue: 140 + ((index * 7) % 40),
    cameraKey: pickString(obj, 'id', 'cameraId') || id,
    isPrimary: obj['isPrimary'] === true,
  };
}

export function mapCameras(value: unknown): CameraInfo[] {
  const list = Array.isArray(value) ? value : pickArray(value, 'cameras', 'items');
  return list.map((c, i) => mapCamera(c, i));
}

export type UiKpi = {
  label: string;
  type: ViolationType;
  count: number;
  percent: number;
  delta: number;
};

const KPI_KEYS: Array<{ keys: string[]; type: ViolationType }> = [
  { keys: ['helmet'], type: 'Helmet' },
  { keys: ['gloves'], type: 'Gloves' },
  { keys: ['safetyGlasses'], type: 'Safety Glasses' },
  { keys: ['arcFlashSuit'], type: 'Arc Flash Suit' },
  { keys: ['arcFlashShield', 'arcShield', 'vest'], type: 'Arc Flash Shield' },
  { keys: ['boots'], type: 'Boots' },
];

export function mapKpis(value: unknown): { compliance: string; items: UiKpi[] } {
  const obj = asRecord(value);
  const root = asRecord(obj?.['kpiSummary']) ?? obj;
  if (!root) return { compliance: '0.0', items: [] };

  const items: UiKpi[] = [];
  for (const { keys, type } of KPI_KEYS) {
    let metric: Record<string, unknown> | null = null;
    for (const key of keys) {
      metric = asRecord(root[key]);
      if (metric) break;
    }
    if (!metric) continue;
    items.push({
      label: `${type} Violations`,
      type,
      count: pickNumber(metric, 'rawEventCount'),
      percent: pickNumber(metric, 'violationRate'),
      delta: pickNumber(metric, 'trendPercent'),
    });
  }

  const avgRate =
    items.length > 0 ? items.reduce((sum, i) => sum + i.percent, 0) / items.length : 0;
  const compliance = Math.max(0, 100 - avgRate).toFixed(1);

  return { compliance, items };
}

export function mapNotifications(value: unknown): ApiNotification[] {
  return pickArray<Record<string, unknown>>(value).map((n) => ({
    id: pickString(n, 'id', 'notificationId'),
    title: pickString(n, 'title'),
    message: pickString(n, 'message'),
    isRead: n['isRead'] === true,
    severity: pickString(n, 'severity'),
    createdAt: pickString(n, 'createdAt'),
    violationId: pickString(n, 'detectionLogId') || null,
  }));
}

export function extractAuthSession(value: unknown): {
  token: string;
  refreshToken?: string;
  user: AuthUser;
} {
  const obj = asRecord(value) ?? {};
  const nested = asRecord(obj['data']) ?? obj;
  const token = pickString(nested, 'token', 'accessToken');
  if (!token) throw new Error('Authentication response did not include a token.');

  const user: AuthUser = {
    id: pickString(nested, 'userId', 'id') || undefined,
    fullName: pickString(nested, 'fullName') || undefined,
    email: pickString(nested, 'email') || undefined,
    roles: Array.isArray(nested['roles']) ? (nested['roles'] as string[]) : undefined,
    permissions: Array.isArray(nested['permissions'])
      ? (nested['permissions'] as string[])
      : Array.isArray(nested['actions'])
        ? (nested['actions'] as string[])
        : undefined,
  };

  return {
    token,
    refreshToken: pickString(nested, 'refreshToken') || undefined,
    user,
  };
}

/** @deprecated use extractAuthSession */
export function extractTokenPayload(value: unknown): { token: string; refreshToken?: string } {
  const session = extractAuthSession(value);
  return { token: session.token, refreshToken: session.refreshToken };
}
