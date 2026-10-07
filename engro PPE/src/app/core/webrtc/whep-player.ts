/**
 * Minimal WHEP (WebRTC-HTTP Egress Protocol) client for MediaMTX / similar servers.
 * No HLS — recvonly RTCPeerConnection + application/sdp POST.
 */

export type WhepPlayerStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error';

export type WhepPlayerOptions = {
  url: string;
  video: HTMLVideoElement;
  /** Called when status changes. */
  onStatus?: (status: WhepPlayerStatus, detail?: string) => void;
  /** Auto-reconnect after failure (default true). */
  autoReconnect?: boolean;
  /** Base delay for reconnect backoff (ms). */
  reconnectDelayMs?: number;
};

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export function isWhepUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  if (!u || u.startsWith('rtsp://') || u.startsWith('rtsps://')) return false;
  if (u.includes('.m3u8') || u.includes('/hls/') || u.includes('application/vnd.apple.mpegurl')) {
    return false;
  }
  return u.includes('/whep') || u.startsWith('whep://') || u.startsWith('wheps://');
}

export function isHlsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return u.includes('.m3u8') || u.includes('application/vnd.apple.mpegurl') || u.includes('/hls/');
}

/** Prefer whepUrl; accept streamUrl only when it is WHEP; never use HLS. */
export function resolveWhepUrl(parts: {
  whepUrl?: string | null;
  streamUrl?: string | null;
  stream?: { whepUrl?: string | null; url?: string | null } | null;
  fallback?: string | null;
}): string | null {
  const candidates = [
    parts.whepUrl,
    parts.stream?.whepUrl,
    parts.streamUrl,
    parts.stream?.url,
    parts.fallback,
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (!t) continue;
    if (isHlsUrl(t)) continue;
    if (isWhepUrl(t)) return t;
  }
  return null;
}

export class WhepPlayer {
  private pc?: RTCPeerConnection;
  private sessionUrl?: string;
  private closed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private readonly opts: Required<Pick<WhepPlayerOptions, 'autoReconnect' | 'reconnectDelayMs'>> &
    WhepPlayerOptions;

  constructor(opts: WhepPlayerOptions) {
    this.opts = {
      autoReconnect: true,
      reconnectDelayMs: 1500,
      ...opts,
    };
  }

  get url() {
    return this.opts.url;
  }

  async start(): Promise<void> {
    this.closed = false;
    await this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    void this.teardownSession();
    this.setStatus('idle');
  }

  private setStatus(status: WhepPlayerStatus, detail?: string) {
    this.opts.onStatus?.(status, detail);
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    this.setStatus('connecting');
    await this.teardownSession(false);

    const pc = new RTCPeerConnection({
      // Prefer host/srflx quickly; MediaMTX often on LAN.
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      bundlePolicy: 'max-bundle',
    });
    this.pc = pc;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      const video = this.opts.video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      // Avoid HTMLMediaElement buffering heuristics where possible.
      try {
        (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
      } catch {
        /* ignore */
      }
      // Prefer lowest playout delay so live video stays closer to detections.
      this.applyLowLatencyHints(pc);
      void video.play().catch(() => undefined);
      this.setStatus('live');
      this.attempt = 0;
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'disconnected') {
        this.setStatus('offline', `WebRTC ${state}`);
        this.scheduleReconnect();
      } else if (state === 'connected') {
        this.setStatus('live');
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error('Missing local SDP offer.');

      const res = await fetch(this.opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: sdp,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`WHEP ${res.status}: ${text || res.statusText}`);
      }

      const location = res.headers.get('Location');
      if (location) {
        try {
          this.sessionUrl = new URL(location, this.opts.url).href;
        } catch {
          this.sessionUrl = location;
        }
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WHEP connect failed';
      this.setStatus('error', msg);
      await this.teardownSession(false);
      this.scheduleReconnect();
    }
  }

  /** Ask the browser to minimize jitter-buffer / playout delay on the video receiver. */
  private applyLowLatencyHints(pc: RTCPeerConnection) {
    for (const receiver of pc.getReceivers()) {
      if (receiver.track?.kind !== 'video') continue;
      const r = receiver as RTCRtpReceiver & {
        playoutDelayHint?: number;
        jitterBufferTarget?: number;
      };
      try {
        if ('playoutDelayHint' in r) r.playoutDelayHint = 0;
      } catch {
        /* unsupported */
      }
      try {
        if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
      } catch {
        /* unsupported */
      }
    }
  }

  private scheduleReconnect() {
    if (this.closed || !this.opts.autoReconnect) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(12000, this.opts.reconnectDelayMs * Math.pow(1.6, this.attempt));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  private async teardownSession(clearVideo = true): Promise<void> {
    if (this.sessionUrl) {
      try {
        await fetch(this.sessionUrl, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
      this.sessionUrl = undefined;
    }
    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = undefined;
    }
    if (clearVideo) {
      const video = this.opts.video;
      video.srcObject = null;
      video.removeAttribute('src');
    }
  }
}
