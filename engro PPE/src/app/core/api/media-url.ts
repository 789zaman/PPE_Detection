import { environment } from '../../../environments/environment';

/**
 * Resolve BE imagePath / storageKey / absolute snapshot URL to a browser-loadable URL.
 *
 * BE may return:
 * - absolute: http://localhost:5288/snapshots/CAM-LIVE-01/{guid}.jpg
 * - relative storage key: snapshots/CAM-LIVE-01/{guid}.jpg
 * - rooted path: /snapshots/... (or legacy /captures/...)
 */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  let trimmed = path.trim();
  if (!trimmed) return null;

  if (trimmed === 'null' || trimmed === 'undefined') return null;

  const base = (environment.mediaBaseUrl || environment.apiBaseUrl || '').replace(/\/+$/, '');

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    if (/^https?:\/\//i.test(trimmed) && base) {
      try {
        const u = new URL(trimmed);
        // Prefer configured API host for snapshot / legacy capture paths.
        if (u.pathname.startsWith('/snapshots/') || u.pathname.startsWith('/captures/')) {
          return `${base}${u.pathname}${u.search}`;
        }
      } catch {
        /* keep original */
      }
    }
    return trimmed;
  }

  trimmed = trimmed.replace(/\\/g, '/');
  if (!base) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  return `${base}/${trimmed.replace(/^\/+/, '')}`;
}
