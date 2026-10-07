export type ViolationType =
  | 'Helmet'
  | 'Gloves'
  | 'Safety Glasses'
  | 'Arc Flash Suit'
  | 'Arc Flash Shield'
  | 'Boots';

/** Person boxes are overlays only — never a PPE miss class. */
export type LogRowType = ViolationType | 'Person';

export const VIOLATION_TYPES: ViolationType[] = [
  'Helmet',
  'Gloves',
  'Safety Glasses',
  'Arc Flash Suit',
  'Arc Flash Shield',
  'Boots',
];

export function isPpeViolationType(type: string | undefined | null): type is ViolationType {
  return !!type && (VIOLATION_TYPES as readonly string[]).includes(type);
}

export const ZONES = [
  'Urea Plant - Bay 3',
  'Ammonia Unit - Compressor',
  'Switchgear Room 2',
  'Bagging Line A',
  'Loading Dock 7',
  'Utilities - Boiler House',
];

export const WORKERS = [
  'M. Arslan',
  'S. Rehman',
  'K. Bhatti',
  'A. Qureshi',
  'F. Nadeem',
  'H. Iqbal',
  'Z. Malik',
];

export type LogRowBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  classKey?:
    | 'person'
    | 'goggles'
    | 'helmet'
    | 'arc_shield'
    | 'arc_suit'
    | 'arc_gloves'
    | 'boots'
    | 'unknown';
  classLabel?: string;
  classRaw?: string;
  confidence?: number;
};

export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Warning' | 'Critical';

/** Floor ROI classification from BE (shocking-zone polygons). */
export type PpeZoneKind = 'OUTSIDE' | 'SHOCKING';

export type LogRow = {
  id: string;
  time: string;
  type: LogRowType;
  /** Plant / named zone (legacy zoneName). */
  zone: string;
  /** Floor ROI from BE when present: OUTSIDE | SHOCKING. */
  ppeZone?: PpeZoneKind | null;
  /** True when BE marks violation as immediate (all classes inside shocking zone). */
  isImmediate?: boolean;
  worker: string;
  /** Stable worker id when BE sends it (used for open-session grouping). */
  workerCode?: string | null;
  camera: string;
  severity: AlertSeverity;
  confidence: number;
  boundingBoxes?: LogRowBox[];
  isViolation?: boolean;
  /** Ingest helmetDetected. Never infer a helmet miss from false alone. */
  helmetDetected?: boolean | null;
  missingPpe?: string;
  frameWidth?: number;
  frameHeight?: number;
  imagePath?: string | null;
};

/** Gap after which the same worker + PPE type starts a new open session. */
export const VIOLATION_SESSION_GAP_MS = 3 * 60 * 1000;

/** How long a violation stays "happening now" for alarm, overlay, and live badges.
 *  Cover one live-pulse gap from the model (~1s), not a long freeze. */
export const LIVE_VIOLATION_TTL_MS = 3500;

/** Helmet siren/overlay only when ingest says this row is a helmet violation. */
export function isHelmetAlarm(row: LogRow): boolean {
  return row.isViolation === true && row.type === 'Helmet';
}

/** Any PPE alarm row. Person overlays and unknown types never alarm. */
export function isPpeAlarm(row: LogRow): row is LogRow & { type: ViolationType; isViolation: true } {
  return row.isViolation === true && isPpeViolationType(row.type);
}

export function ingestWorkerKey(row: LogRow): string {
  return String(row.workerCode || row.worker || 'unknown')
    .trim()
    .toLowerCase();
}

export function latestIngestByWorker(rows: LogRow[]): Map<string, LogRow> {
  const latest = new Map<string, LogRow>();
  for (const row of rows) {
    const key = ingestWorkerKey(row);
    const prev = latest.get(key);
    const t = Date.parse(row.time) || 0;
    const pt = prev ? Date.parse(prev.time) || 0 : -1;
    if (!prev || t >= pt) latest.set(key, row);
  }
  return latest;
}

export function workerHasLeft(row: LogRow): boolean {
  return row.isViolation === false && !(row.boundingBoxes && row.boundingBoxes.length);
}

/** Hide a stored helmet miss when a newer ingest for the same S-N cleared it. */
export function isSupersededHelmetMiss(row: LogRow, latest: LogRow | undefined): boolean {
  if (!isHelmetAlarm(row) || !latest) return false;
  const lt = Date.parse(latest.time) || 0;
  const rt = Date.parse(row.time) || 0;
  if (lt < rt) return false;
  if (latest.helmetDetected === true) return true;
  if (workerHasLeft(latest)) return true;
  // Latest row for this S-N is not a helmet violation (worn, person pulse, leave).
  if (!isHelmetAlarm(latest)) return true;
  return false;
}

export function liveAlarms(rows: LogRow[]): LogRow[] {
  const latestByWorker = latestIngestByWorker(rows);
  return rows.filter((row) => {
    if (!isPpeAlarm(row)) return false;
    const latest = latestByWorker.get(ingestWorkerKey(row));
    if (latest && workerHasLeft(latest)) return false;
    if (row.type === 'Helmet' && isSupersededHelmetMiss(row, latest)) return false;
    return true;
  });
}

export function isLivePpeMiss(row: LogRow): boolean {
  return isPpeAlarm(row);
}

export function isLiveViolationNow(
  row: LogRow,
  now = Date.now(),
  ttlMs = LIVE_VIOLATION_TTL_MS,
): boolean {
  if (!isLivePpeMiss(row)) return false;
  const t = Date.parse(row.time);
  if (!Number.isFinite(t)) return true;
  return now - t <= ttlMs;
}

export function violationSessionWorkerKey(row: LogRow): string {
  const code = String(row.workerCode || row.worker || 'unknown')
    .trim()
    .toLowerCase();
  return `${code}::${row.type}`;
}

/**
 * Collapse detection spam into one row per open session
 * (workerCode + violationType + contiguous time cluster).
 * Does not change zone labels or alarm rules — display grouping only.
 */
export function collapseOpenViolationSessions(rows: LogRow[]): LogRow[] {
  const violations = rows.filter((r) => r.isViolation !== false);
  const others = rows.filter((r) => r.isViolation === false);
  if (violations.length <= 1) return [...violations, ...others];

  const sorted = [...violations].sort(
    (a, b) => (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0),
  );

  type Cursor = { sessionId: string; lastTime: number };
  const cursorByKey = new Map<string, Cursor>();
  const latestBySession = new Map<string, LogRow>();

  for (const row of sorted) {
    const base = violationSessionWorkerKey(row);
    const t = Date.parse(row.time) || 0;
    const prev = cursorByKey.get(base);
    const sessionId =
      !prev || t - prev.lastTime > VIOLATION_SESSION_GAP_MS ? row.id : prev.sessionId;
    cursorByKey.set(base, { sessionId, lastTime: t });

    const fullKey = `${base}::${sessionId}`;
    const existing = latestBySession.get(fullKey);
    if (!existing || t >= (Date.parse(existing.time) || 0)) {
      latestBySession.set(fullKey, row);
    }
  }

  const collapsed = [...latestBySession.values()].sort(
    (a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0),
  );
  return [...collapsed, ...others];
}

/**
 * Live upsert: replace the open session for the same worker + type
 * instead of stacking duplicate detection rows.
 */
export function shareSiblingSnapshots(rows: LogRow[], windowMs = 5000): LogRow[] {
  return rows.map((row) => {
    if (row.imagePath) return row;
    const t = Date.parse(row.time);
    if (!Number.isFinite(t)) return row;
    const sibling = rows.find((other) => {
      if (!other.imagePath || other.id === row.id) return false;
      if (row.camera && other.camera && row.camera !== other.camera) return false;
      const ot = Date.parse(other.time);
      return Number.isFinite(ot) && Math.abs(ot - t) <= windowMs;
    });
    return sibling?.imagePath ? { ...row, imagePath: sibling.imagePath } : row;
  });
}

export function mergeLiveViolation(existing: LogRow[], incoming: LogRow): LogRow[] {
  const key = violationSessionWorkerKey(incoming);
  const t = Date.parse(incoming.time) || Date.now();

  // Non-alarm ingest (helmetDetected=true, leave/reset, duplicate pulse).
  // Keep the row as the latest ingest for this S-N. Do not paint it as a miss.
  if (incoming.isViolation === false) {
    return [incoming, ...existing.filter((x) => x.id !== incoming.id)];
  }

  const filtered = existing.filter((row) => {
    if (row.id === incoming.id) return false;
    if (row.isViolation === false) return true;
    if (violationSessionWorkerKey(row) !== key) return true;
    const rt = Date.parse(row.time) || 0;
    // Same open session → drop older/duplicate detection row.
    return Math.abs(t - rt) > VIOLATION_SESSION_GAP_MS;
  });
  return [incoming, ...filtered];
}

/** e.g. Helmet → "Helmet not detected" (every PPE class). */
export function notDetectedLabel(type: string, missingPpe?: string | null): string {
  if (!missingPpe && /^person$/i.test(String(type || '').trim())) return 'Person';
  const raw = String(missingPpe || type || 'PPE').trim();
  const base = raw.replace(/\s+not\s+detected$/i, '').trim() || 'PPE';
  return `${base} not detected`;
}

/**
 * Two violation zone kinds on the dashboard / history:
 * - Shocking boundary zone (inside polygon) — all PPE, immediate
 * - Outside zone (everyone else / no polygon hit)
 */
export function zoneTypeLabel(ppeZone?: PpeZoneKind | null): 'Shocking boundary zone' | 'Outside zone' {
  return ppeZone === 'SHOCKING' ? 'Shocking boundary zone' : 'Outside zone';
}

export function isShockingZone(ppeZone?: PpeZoneKind | null, isImmediate?: boolean): boolean {
  return ppeZone === 'SHOCKING' || isImmediate === true;
}

export type TrendRow = {
  date: string;
  Helmet: number;
  Gloves: number;
  Glasses: number;
  ArcFlash: number;
  ArcShield: number;
  Boots: number;
  total: number;
};

let counter = 1000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function makeLog(date = new Date()): LogRow {
  counter += 1;
  const type = pick(VIOLATION_TYPES);
  return {
    id: `EFL-${counter}`,
    time: date.toISOString(),
    type,
    zone: pick(ZONES),
    worker: pick(WORKERS),
    camera: `CAM-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}`,
    severity:
      type === 'Arc Flash Suit' || type === 'Helmet' || type === 'Boots'
        ? 'High'
        : pick(['Low', 'Medium'] as const),
    confidence: Math.round((0.78 + Math.random() * 0.21) * 100),
  };
}

export function seedLogs(n = 24): LogRow[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => makeLog(new Date(now - i * 1000 * 60 * (7 + i))));
}

export function seedTrend(days = 14): TrendRow[] {
  const out: TrendRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const Helmet = 4 + Math.round(Math.random() * 12);
    const Gloves = 3 + Math.round(Math.random() * 10);
    const Glasses = 2 + Math.round(Math.random() * 9);
    const ArcFlash = 1 + Math.round(Math.random() * 5);
    const ArcShield = 2 + Math.round(Math.random() * 8);
    const Boots = 2 + Math.round(Math.random() * 7);
    out.push({
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      Helmet,
      Gloves,
      Glasses,
      ArcFlash,
      ArcShield,
      Boots,
      total: Helmet + Gloves + Glasses + ArcFlash + ArcShield + Boots,
    });
  }
  return out;
}

export function toCsv(rows: LogRow[]): string {
  const head = ['ID', 'Timestamp', 'Violation', 'Zone', 'Worker', 'Camera', 'Severity', 'Confidence %'];
  const body = rows.map((r) =>
    [r.id, new Date(r.time).toLocaleString(), r.type, r.zone, r.worker, r.camera, r.severity, r.confidence]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [head.join(','), ...body].join('\n');
}
