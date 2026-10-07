export const environment = {
  production: false,
  /** Direct API origin so the browser uses CORS (BE allows loopback in Development). */
  apiBaseUrl: 'http://localhost:5288',
  /** Fallback inference frame size when BE does not send frameWidth/frameHeight. */
  inferenceFrameWidth: 1920,
  inferenceFrameHeight: 1080,
  /**
   * HTTP video fallback only when live API has no whepUrl/videoUrl.
   * Empty = no seed MP4 (prefer live WebRTC from BE).
   */
  defaultVideoUrl: '',
  /** Local MediaMTX WHEP when live API omits whepUrl. */
  defaultWhepUrl: 'http://127.0.0.1:8889/cam-live-01/whep',
  /**
   * Base URL for violation snapshot files when API returns a relative imagePath
   * (e.g. "captures/cam07/shot.jpg"). Leave empty if imagePath is already absolute
   * or if BE/CDN is not serving capture files yet.
   */
  mediaBaseUrl: 'http://localhost:5288',
};
