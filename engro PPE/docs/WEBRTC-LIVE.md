# WebRTC live view (WHEP)

Angular live camera playback uses **WHEP** against MediaMTX (or any WHEP server). HLS is not used.

## Player

- `src/app/core/webrtc/whep-player.ts` — `RTCPeerConnection` + `POST application/sdp`
- `src/app/components/camera-stream/camera-stream.component.ts` — attaches player to `<video>`

## Configure camera

Until BE adds a dedicated `whepUrl` column, store the WHEP URL in `streamUrl`:

```text
http://127.0.0.1:8889/cam-live-01/whep
```

Settings → Cameras form accepts this value. Dev also falls back to `environment.defaultWhepUrl`.

## MediaMTX (ops, out of FE scope)

Enable WebRTC (port **8889**) on the same path as the RTSP pull. FE does not start MediaMTX.

## Acceptance

- Live view connects via WebRTC only
- No `hls.js` / `.m3u8` playback
- Boxes scale with `frameWidth`/`frameHeight` onto the video content box
