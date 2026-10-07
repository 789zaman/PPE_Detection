import { environment } from '../../../environments/environment';

/**
 * YOLOv11n class map (do not reorder):
 * 0 person | 1 goggles | 2 helmet | 3 arc_shield | 4 arc_suit | 5 arc_gloves | 6 boots
 */
export type DetectionClass =
  | 'person'
  | 'goggles'
  | 'helmet'
  | 'arc_shield'
  | 'arc_suit'
  | 'arc_gloves'
  | 'boots'
  | 'unknown';

export type BoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  classKey?: DetectionClass;
  /** Friendly label for UI (e.g. "Person", "No Helmet"). */
  classLabel?: string;
  /** Raw model label if provided. */
  classRaw?: string;
  confidence?: number;
};

export type DetectionBoxState = 'violation' | 'warning' | 'ok';

export type DetectionOverlay = {
  id: string;
  label: string;
  confidence: number;
  state: DetectionBoxState;
  boxes: BoundingBox[];
  camera?: string;
  worker?: string;
  time?: string;
  frameWidth?: number;
  frameHeight?: number;
  /** Fallback class when individual boxes omit class — prefer person (bridge default). */
  fallbackClassKey?: DetectionClass;
};

/** Distinct color per detection class. */
export const CLASS_COLORS: Record<DetectionClass, string> = {
  person: '#eab308',
  goggles: '#a855f7',
  helmet: '#dc2626',
  arc_shield: '#0d9488',
  arc_suit: '#f97316',
  arc_gloves: '#2563eb',
  boots: '#7c3aed',
  unknown: '#94a3b8',
};

export const CLASS_LEGEND: Array<{ key: DetectionClass; label: string; color: string }> = [
  { key: 'person', label: 'Person', color: CLASS_COLORS.person },
  { key: 'goggles', label: 'Goggles', color: CLASS_COLORS.goggles },
  { key: 'helmet', label: 'Helmet', color: CLASS_COLORS.helmet },
  { key: 'arc_shield', label: 'Arc Shield', color: CLASS_COLORS.arc_shield },
  { key: 'arc_suit', label: 'Arc Suit', color: CLASS_COLORS.arc_suit },
  { key: 'arc_gloves', label: 'Arc Gloves', color: CLASS_COLORS.arc_gloves },
  { key: 'boots', label: 'Boots', color: CLASS_COLORS.boots },
];

/** Numeric cls on a box is the YOLOv11n class id, never a dashboard enum ordinal. */
const CLASS_ID_MAP: Record<number, DetectionClass> = {
  0: 'person',
  1: 'goggles',
  2: 'helmet',
  3: 'arc_shield',
  4: 'arc_suit',
  5: 'arc_gloves',
  6: 'boots',
};

export function classColor(key?: DetectionClass | string | null): string {
  const k = normalizeClassKey(key);
  return CLASS_COLORS[k] ?? CLASS_COLORS.unknown;
}

/** Live overlay must not keep a rectangle stuck on a detected person. */
export function isPersonClassBox(box: {
  classKey?: string | null;
  classRaw?: string | null;
  classLabel?: string | null;
}): boolean {
  if (!box.classKey && !box.classRaw && !box.classLabel) return true;
  return normalizeClassKey(box.classKey || box.classRaw || box.classLabel) === 'person';
}

export function withoutPersonBoxes(boxes: BoundingBox[] | undefined | null): BoundingBox[] {
  if (!boxes?.length) return [];
  return boxes.filter((b) => !isPersonClassBox(b));
}

/** Ingest overlay is person xyxy only. */
export function personBoxesOnly(boxes: BoundingBox[] | undefined | null): BoundingBox[] {
  if (!boxes?.length) return [];
  return boxes.filter((b) => isPersonClassBox(b));
}

export function normalizeClassKey(raw: unknown): DetectionClass {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return CLASS_ID_MAP[Math.trunc(raw)] ?? 'unknown';
  }

  const original = String(raw ?? '').trim();
  if (!original) return 'unknown';

  // Numeric string class id
  if (/^\d+$/.test(original)) {
    return CLASS_ID_MAP[Number(original)] ?? 'unknown';
  }

  const s = original
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w]/g, '');

  if (s === 'person') return 'person';

  if (s === 'goggles') return 'goggles';
  if (s === 'helmet') return 'helmet';
  if (s === 'arc_shield' || s === 'arcshield') return 'arc_shield';
  if (s === 'arc_suit' || s === 'arcsuit') return 'arc_suit';
  if (s === 'arc_gloves' || s === 'arcgloves') return 'arc_gloves';
  if (s === 'boots' || s === 'boot') return 'boots';

  return 'unknown';
}

export function classDisplayName(key: DetectionClass): string {
  switch (key) {
    case 'person':
      return 'Person';
    case 'goggles':
      return 'Goggles';
    case 'helmet':
      return 'Helmet';
    case 'arc_shield':
      return 'Arc Shield';
    case 'arc_suit':
      return 'Arc Suit';
    case 'arc_gloves':
      return 'Arc Gloves';
    case 'boots':
      return 'Boots';
    default:
      return 'Detection';
  }
}

/** Friendly label; preserves "No …" when model class indicates absence. */
export function formatClassLabel(classKey: DetectionClass, classRaw?: string | null): string {
  const base = classDisplayName(classKey);
  if (classKey === 'person' || classKey === 'unknown') return base;
  const raw = String(classRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (
    raw.startsWith('no_') ||
    raw.startsWith('missing_') ||
    raw.startsWith('without_') ||
    raw.includes('_no_') ||
    raw.includes('not_wearing')
  ) {
    return `No ${base}`;
  }
  return base;
}

export type ParseBoxesOptions = {
  /** Used only when a box has no class field. Bridge person boxes omit class → use person. */
  fallbackClass?: unknown;
  frameWidth?: number;
  frameHeight?: number;
};

/** Safely normalize API `boundingBoxes` (JSON string or array) to pixel xywh boxes. */
export function parseBoundingBoxes(raw: unknown, fallbackClassOrOpts?: unknown | ParseBoxesOptions): BoundingBox[] {
  const opts: ParseBoxesOptions =
    fallbackClassOrOpts && typeof fallbackClassOrOpts === 'object' && !Array.isArray(fallbackClassOrOpts)
      && ('fallbackClass' in (fallbackClassOrOpts as object) ||
        'frameWidth' in (fallbackClassOrOpts as object) ||
        'frameHeight' in (fallbackClassOrOpts as object))
      ? (fallbackClassOrOpts as ParseBoxesOptions)
      : { fallbackClass: fallbackClassOrOpts };

  if (raw == null || raw === '') return [];

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '[]') return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  // Bridge default: unlabeled box = person localization, NOT violation type.
  const fallback =
    opts.fallbackClass != null && String(opts.fallbackClass).trim() !== ''
      ? normalizeClassKey(opts.fallbackClass)
      : 'person';

  const fw = opts.frameWidth && opts.frameWidth > 0 ? opts.frameWidth : inferenceFrameSize().width;
  const fh = opts.frameHeight && opts.frameHeight > 0 ? opts.frameHeight : inferenceFrameSize().height;

  if (!Array.isArray(value)) {
    const one = normalizeBox(value, fallback, fw, fh);
    return one ? [one] : [];
  }

  // Nested: { boxes: [...] } mistakenly double-wrapped
  if (value.length === 1 && value[0] && typeof value[0] === 'object' && !Array.isArray(value[0])) {
    const inner = value[0] as Record<string, unknown>;
    if (Array.isArray(inner['boxes']) || Array.isArray(inner['boundingBoxes'])) {
      return parseBoundingBoxes(inner['boxes'] ?? inner['boundingBoxes'], opts);
    }
  }

  return value.map((v) => normalizeBox(v, fallback, fw, fh)).filter((b): b is BoundingBox => !!b);
}

function normalizeBox(
  raw: unknown,
  fallback: DetectionClass,
  frameWidth: number,
  frameHeight: number,
): BoundingBox | null {
  if (raw == null) return null;

  // Plain tuple — bridge contract is xywh; treat [x,y,w,h] as sizes (not xyxy).
  if (Array.isArray(raw)) {
    if (raw.length < 4) return null;
    const a = num(raw[0]);
    const b = num(raw[1]);
    const c = num(raw[2]);
    const d = num(raw[3]);
    if (a == null || b == null || c == null || d == null) return null;
    return finalizeBox(a, b, c, d, fallback, undefined, undefined, frameWidth, frameHeight);
  }

  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const classRaw =
    o['class'] ??
    o['className'] ??
    o['class_name'] ??
    o['label'] ??
    o['name'] ??
    o['cls'] ??
    o['category'] ??
    o['type'] ??
    o['ppeType'] ??
    o['ppe_type'];

  let classKey: DetectionClass =
    classRaw != null && String(classRaw).trim() !== ''
      ? normalizeClassKey(classRaw)
      : fallback;

  // If cls is numeric and string label was garbage
  if (classKey === 'unknown') {
    const id = num(o['classId'] ?? o['class_id'] ?? o['cls']);
    if (id != null && CLASS_ID_MAP[Math.trunc(id)]) {
      classKey = CLASS_ID_MAP[Math.trunc(id)];
    }
  }

  let confidence = num(o['confidence'] ?? o['score'] ?? o['conf']);
  if (confidence != null && confidence > 0 && confidence <= 1) {
    confidence = Math.round(confidence * 100);
  }

  // Prefer explicit xyxy corners when present (Ultralytics-style).
  const x1 = num(o['x1'] ?? o['xmin'] ?? o['x_min']);
  const y1 = num(o['y1'] ?? o['ymin'] ?? o['y_min']);
  const x2 = num(o['x2'] ?? o['xmax'] ?? o['x_max']);
  const y2 = num(o['y2'] ?? o['ymax'] ?? o['y_max']);

  let x = num(o['x'] ?? o['left'] ?? o['X']);
  let y = num(o['y'] ?? o['top'] ?? o['Y']);
  let w = num(o['w'] ?? o['width'] ?? o['W']);
  let h = num(o['h'] ?? o['height'] ?? o['H']);

  if (x1 != null && y1 != null && x2 != null && y2 != null) {
    x = x1;
    y = y1;
    w = x2 - x1;
    h = y2 - y1;
  }

  // Nested box payload
  if ((x == null || y == null || w == null || h == null) && o['box'] != null) {
    const nested = normalizeBox(o['box'], classKey, frameWidth, frameHeight);
    if (nested) {
      return {
        ...nested,
        classKey,
        classRaw: classRaw != null ? String(classRaw) : nested.classRaw,
        classLabel: formatClassLabel(classKey, classRaw != null ? String(classRaw) : nested.classRaw),
        confidence: confidence ?? nested.confidence,
      };
    }
  }

  if (x == null || y == null || w == null || h == null) return null;

  return finalizeBox(
    x,
    y,
    w,
    h,
    classKey,
    classRaw != null ? String(classRaw) : undefined,
    confidence ?? undefined,
    frameWidth,
    frameHeight,
  );
}

function finalizeBox(
  x0: number,
  y0: number,
  w0: number,
  h0: number,
  classKey: DetectionClass,
  classRaw: string | undefined,
  confidence: number | undefined,
  frameWidth: number,
  frameHeight: number,
): BoundingBox | null {
  let x = x0;
  let y = y0;
  let w = w0;
  let h = h0;

  // Normalized 0–1 coords → pixels (bridge normally sends absolute pixels).
  const maxAbs = Math.max(Math.abs(x), Math.abs(y), Math.abs(w), Math.abs(h), Math.abs(x + w), Math.abs(y + h));
  if (maxAbs > 0 && maxAbs <= 1.5) {
    x *= frameWidth;
    y *= frameHeight;
    w *= frameWidth;
    h *= frameHeight;
  }

  if (!(w > 0) || !(h > 0)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x,
    y,
    w,
    h,
    classKey,
    classRaw,
    classLabel: formatClassLabel(classKey, classRaw),
    confidence,
  };
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function inferenceFrameSize(): { width: number; height: number } {
  const width = environment.inferenceFrameWidth || 1920;
  const height = environment.inferenceFrameHeight || 1080;
  return { width, height };
}

/** object-fit: contain content box of media inside a container. */
export function containedMediaRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): { left: number; top: number; width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Map inference-frame pixels → overlay coords using the rendered video content box.
 * scaleX = displayedVideoWidth / frameWidth
 * scaleY = displayedVideoHeight / frameHeight
 */
export function scaleBoxesToVideoContent(
  boxes: BoundingBox[],
  content: { left: number; top: number; width: number; height: number },
  frameWidth?: number,
  frameHeight?: number,
): Array<BoundingBox & { left: number; top: number }> {
  const fallback = inferenceFrameSize();
  const fw = frameWidth && frameWidth > 0 ? frameWidth : fallback.width;
  const fh = frameHeight && frameHeight > 0 ? frameHeight : fallback.height;
  if (content.width <= 0 || content.height <= 0 || fw <= 0 || fh <= 0) return [];

  const scaleX = content.width / fw;
  const scaleY = content.height / fh;

  return boxes.map((b) => ({
    ...b,
    w: b.w * scaleX,
    h: b.h * scaleY,
    left: content.left + b.x * scaleX,
    top: content.top + b.y * scaleY,
  }));
}

export function scaleBoxesToContain(
  boxes: BoundingBox[],
  containerWidth: number,
  containerHeight: number,
  sourceWidth?: number,
  sourceHeight?: number,
): Array<BoundingBox & { left: number; top: number }> {
  const srcW = sourceWidth && sourceWidth > 0 ? sourceWidth : inferenceFrameSize().width;
  const srcH = sourceHeight && sourceHeight > 0 ? sourceHeight : inferenceFrameSize().height;
  const content = containedMediaRect(containerWidth, containerHeight, srcW, srcH);
  return scaleBoxesToVideoContent(boxes, content, srcW, srcH);
}

export function detectionLabel(parts: {
  missingPpe?: string | null;
  type?: string | null;
  isViolation?: boolean;
}): string {
  if (parts.isViolation === true && parts.missingPpe) {
    return `${parts.missingPpe} missing`;
  }
  if (parts.isViolation === true && parts.type) {
    return `${parts.type} missing`;
  }
  return 'Person';
}

export function boxLabel(box: BoundingBox, _fallback?: string): string {
  return (
    box.classLabel ||
    (box.classKey ? formatClassLabel(box.classKey, box.classRaw) : null) ||
    'Person'
  );
}

export function detectionState(parts: {
  isViolation?: boolean;
  severity?: string | null;
}): DetectionBoxState {
  if (parts.isViolation === false) return 'ok';
  const s = String(parts.severity ?? '').toLowerCase();
  if (s === 'low' || s === 'medium' || s === 'warning') return 'warning';
  if (parts.isViolation || s === 'high' || s === 'critical') return 'violation';
  return 'ok';
}
