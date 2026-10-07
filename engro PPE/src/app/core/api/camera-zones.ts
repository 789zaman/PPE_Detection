import { containedMediaRect } from './bounding-boxes';
import { environment } from '../../../environments/environment';

/** Pixel point in inference / stream frame (default 1920×1080). */
export type ZonePoint = { x: number; y: number };

/** One shocking-zone polygon. Multiple allowed per camera. */
export type ShockingZone = {
  id: string;
  name?: string;
  points: ZonePoint[];
};

export type CameraRoiZones = {
  cameraCode: string;
  cameraId?: string;
  frameWidth: number;
  frameHeight: number;
  shockingZones: ShockingZone[];
};

export type ScaledPolygon = {
  id: string;
  kind: 'shocking';
  points: Array<{ x: number; y: number }>;
  stroke: string;
  fill: string;
};

const STORAGE_PREFIX = 'ppe.cameraRoiZones.';
const SHOCKING_STROKE = '#dc2626';
const SHOCKING_FILL = 'rgba(220, 38, 38, 0.18)';

export function newShockingZoneId(): string {
  return `sz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyCameraZones(cameraCode: string, fw = 1920, fh = 1080): CameraRoiZones {
  return {
    cameraCode,
    frameWidth: fw || environment.inferenceFrameWidth || 1920,
    frameHeight: fh || environment.inferenceFrameHeight || 1080,
    shockingZones: [],
  };
}

export function parseZonePoints(raw: unknown): ZonePoint[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  // BE shape: { type: "polygon", points: [[x,y],…] | [{x,y},…] }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (o['points'] != null) value = o['points'];
    else if (o['polygon'] != null) value = o['polygon'];
    else if (o['vertices'] != null) value = o['vertices'];
  }
  if (!Array.isArray(value)) return [];
  const out: ZonePoint[] = [];
  for (const item of value) {
    if (Array.isArray(item) && item.length >= 2) {
      const x = Number(item[0]);
      const y = Number(item[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const x = Number(o['x'] ?? o['X']);
      const y = Number(o['y'] ?? o['Y']);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
    }
  }
  return out;
}

/** BE / detector polygon payload: { type: "polygon", points: [[x,y],…] }. */
export function toApiPolygonPayload(points: ZonePoint[]): { type: 'polygon'; points: number[][] } | null {
  if (!points || points.length < 3) return null;
  return {
    type: 'polygon',
    points: points.map((p) => [p.x, p.y]),
  };
}

function isPointLike(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  const hasXY = o['x'] != null || o['X'] != null;
  const hasPoly = o['points'] != null || o['polygon'] != null || o['vertices'] != null;
  return hasXY && !hasPoly && o['id'] == null && o['zoneId'] == null;
}

function parseShockingZones(raw: unknown): ShockingZone[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  // Flat list of points → single shocking zone
  if (value.length >= 3 && value.every(isPointLike)) {
    const points = parseZonePoints(value);
    return points.length >= 3 ? [{ id: newShockingZoneId(), points }] : [];
  }

  const out: ShockingZone[] = [];
  value.forEach((item, index) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const points = parseZonePoints(o['points'] ?? o['polygon'] ?? o['vertices']);
      if (!points.length) return;
      const id = String(o['id'] ?? o['zoneId'] ?? `sz-${index + 1}`);
      const name = o['name'] != null ? String(o['name']) : undefined;
      out.push({ id, name, points });
      return;
    }
    if (Array.isArray(item)) {
      const points = parseZonePoints(item);
      if (points.length >= 3) out.push({ id: `sz-${index + 1}`, points });
    }
  });

  return out;
}

/** Migrate legacy yellow/red / shock_boundary polygons into shockingZones. */
function migrateLegacyZones(nested: Record<string, unknown>, obj: Record<string, unknown>): ShockingZone[] {
  const shockBoundary = parseZonePoints(
    nested['shock_boundary_polygon'] ??
      nested['shockBoundaryPolygon'] ??
      nested['shockBoundary'] ??
      nested['shock_boundary'] ??
      obj['shock_boundary_polygon'] ??
      obj['shockBoundaryPolygon'] ??
      obj['shockBoundary'],
  );
  const yellow = parseZonePoints(
    nested['yellowZone'] ?? nested['yellow'] ?? nested['yellowPolygon'] ?? obj['yellowZone'],
  );
  const red = parseZonePoints(nested['redZone'] ?? nested['red'] ?? nested['redPolygon'] ?? obj['redZone']);
  const out: ShockingZone[] = [];
  // Prefer explicit shock boundary as zone 1 when present.
  if (shockBoundary.length >= 3) {
    out.push({ id: 'sz-shock-boundary', name: 'Shock boundary', points: shockBoundary });
  }
  if (yellow.length >= 3) {
    // Skip duplicate if same as shock boundary already added.
    const sameAsShock =
      shockBoundary.length === yellow.length &&
      yellow.every((p, i) => p.x === shockBoundary[i]?.x && p.y === shockBoundary[i]?.y);
    if (!sameAsShock) {
      out.push({
        id: out.length ? 'sz-legacy-yellow' : 'sz-shock-boundary',
        name: out.length ? 'Shocking zone 2' : 'Shock boundary',
        points: yellow,
      });
    }
  }
  if (red.length >= 3) {
    out.push({ id: 'sz-legacy-red', name: `Shocking zone ${out.length + 1}`, points: red });
  }
  return out;
}

export function mapCameraRoiZones(raw: unknown, fallbackCode = ''): CameraRoiZones {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const nested = obj['zones'] && typeof obj['zones'] === 'object' ? (obj['zones'] as Record<string, unknown>) : obj;
  const code = String(nested['cameraCode'] ?? obj['cameraCode'] ?? fallbackCode);
  const fw = Number(nested['frameWidth'] ?? obj['frameWidth'] ?? environment.inferenceFrameWidth) || 1920;
  const fh = Number(nested['frameHeight'] ?? obj['frameHeight'] ?? environment.inferenceFrameHeight) || 1080;

  let shockingZones = parseShockingZones(
    nested['shockingZones'] ??
      nested['shockingZone'] ??
      nested['ShockingZones'] ??
      obj['shockingZones'] ??
      obj['shockingZone'],
  );

  // Backward compat: fold shock_boundary / yellow / red when shockingZones absent
  if (!shockingZones.length) {
    shockingZones = migrateLegacyZones(nested, obj);
  }

  return {
    cameraCode: code,
    cameraId: nested['cameraId'] != null ? String(nested['cameraId']) : undefined,
    frameWidth: fw,
    frameHeight: fh,
    shockingZones,
  };
}

export function scalePolygonToContent(
  points: ZonePoint[],
  content: { left: number; top: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): Array<{ x: number; y: number }> {
  if (!points.length || content.width <= 0 || content.height <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return [];
  }
  const sx = content.width / frameWidth;
  const sy = content.height / frameHeight;
  return points.map((p) => ({
    x: content.left + p.x * sx,
    y: content.top + p.y * sy,
  }));
}

export function buildScaledPolygons(
  zones: CameraRoiZones | null | undefined,
  containerW: number,
  containerH: number,
  mediaW?: number,
  mediaH?: number,
): ScaledPolygon[] {
  if (!zones) return [];
  const fw = zones.frameWidth || 1920;
  const fh = zones.frameHeight || 1080;
  let content;
  if (mediaW && mediaH && mediaW > 0 && mediaH > 0) {
    const videoAspect = mediaW / mediaH;
    const frameAspect = fw / fh;
    const aspectClose = Math.abs(videoAspect - frameAspect) < 0.02;
    content = containedMediaRect(containerW, containerH, aspectClose ? fw : mediaW, aspectClose ? fh : mediaH);
  } else {
    content = containedMediaRect(containerW, containerH, fw, fh);
  }

  return zones.shockingZones
    .filter((z) => z.points.length >= 3)
    .map((z) => ({
      id: z.id,
      kind: 'shocking' as const,
      points: scalePolygonToContent(z.points, content, fw, fh),
      stroke: SHOCKING_STROKE,
      fill: SHOCKING_FILL,
    }));
}

export function pointsToSvg(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

export function cacheCameraZones(zones: CameraRoiZones) {
  try {
    localStorage.setItem(STORAGE_PREFIX + zones.cameraCode, JSON.stringify(zones));
  } catch {
    /* ignore quota */
  }
}

export function readCachedCameraZones(cameraCode: string): CameraRoiZones | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cameraCode);
    if (!raw) return null;
    return mapCameraRoiZones(JSON.parse(raw), cameraCode);
  } catch {
    return null;
  }
}

/** Map BE alert zone classification → UI badge. Only SHOCKING or OUTSIDE. */
export function mapPpeZone(raw: unknown): LogPpeZone | null {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'OUTSIDE' || s === 'OUT' || s === 'NONE' || s === 'SAFE') return 'OUTSIDE';
  // Shocking zone (and legacy yellow/red → shocking)
  if (
    s === 'SHOCKING' ||
    s === 'SHOCKING_ZONE' ||
    s === 'SHOCK' ||
    s === 'YELLOW' ||
    s === 'YELLOW_ZONE' ||
    s === 'WARNING_ZONE' ||
    s === 'AMBER' ||
    s === 'RED' ||
    s === 'RED_ZONE' ||
    s === 'CRITICAL_ZONE' ||
    s === 'DANGER'
  ) {
    return 'SHOCKING';
  }
  return null;
}

export type LogPpeZone = 'OUTSIDE' | 'SHOCKING';
