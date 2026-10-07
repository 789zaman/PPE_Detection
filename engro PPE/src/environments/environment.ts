export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:5288',
  /** Fallback inference frame size when BE does not send frameWidth/frameHeight. */
  inferenceFrameWidth: 1920,
  inferenceFrameHeight: 1080,
  /** Optional local/HTTP video fallback when API omits streamUrl. Empty in production by default. */
  defaultVideoUrl: '',
  defaultWhepUrl: 'http://127.0.0.1:8889/cam-live-01/whep',
  /**
   * Base URL for violation snapshot files when API returns a relative imagePath
   * (e.g. "captures/cam07/shot.jpg"). Leave empty if imagePath is already absolute
   * or if BE/CDN is not serving capture files yet.
   */
  mediaBaseUrl: 'http://localhost:5288',
};
