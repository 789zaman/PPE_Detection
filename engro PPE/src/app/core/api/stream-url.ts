import { environment } from '../../../environments/environment';

/**
 * Resolve a browser-playable local/HTTP video URL for the live dashboard.
 * WebRTC/WHEP and RTSP are intentionally ignored — the detector runs on a local
 * (or HTTP-served) video file and the FE just displays that same file.
 */

const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;

export function isRtspUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return u.startsWith('rtsp://') || u.startsWith('rtsps://');
}

export function isWhepUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  if (!u || isRtspUrl(u)) return false;
  return u.includes('/whep') || u.startsWith('whep://') || u.startsWith('wheps://');
}

export function isHlsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return u.includes('.m3u8') || u.includes('application/vnd.apple.mpegurl') || u.includes('/hls/');
}

/** True when the browser can use progressive <video src> (not WHEP/RTSP/HLS). */
export function isPlayableVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const t = url.trim();
  if (!t || isRtspUrl(t) || isWhepUrl(t) || isHlsUrl(t)) return false;
  if (/^https?:\/\//i.test(t) || t.startsWith('blob:') || t.startsWith('/')) {
    return true;
  }
  // Relative path that looks like a media file / storage key
  if (VIDEO_EXT.test(t) || t.toLowerCase().includes('/videos/') || t.toLowerCase().includes('media/')) {
    return true;
  }
  return false;
}

function toHttpUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  // Ignore absolute Windows / file paths — browser cannot load them directly
  if (/^[a-zA-Z]:\//.test(trimmed) || trimmed.startsWith('file:')) {
    return null;
  }
  const base = (environment.mediaBaseUrl || environment.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  return `${base}/${trimmed.replace(/^\/+/, '')}`;
}

/** Prefer streamUrl (HTTP/local video); never fall back to WHEP. */
export function resolvePlayableVideoUrl(parts: {
  streamUrl?: string | null;
  videoUrl?: string | null;
  stream?: { url?: string | null; videoUrl?: string | null } | null;
  fallback?: string | null;
}): string | null {
  const candidates = [
    parts.videoUrl,
    parts.stream?.videoUrl,
    parts.streamUrl,
    parts.stream?.url,
    parts.fallback,
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (!t) continue;
    if (!isPlayableVideoUrl(t)) continue;
    const http = toHttpUrl(t);
    if (http) return http;
  }
  return null;
}
