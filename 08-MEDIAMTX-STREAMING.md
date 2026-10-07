# MediaMTX and Streaming

## Responsibility

MediaMTX is the streaming layer.

It receives camera RTSP and provides streams to:
- AI worker
- browser/WebRTC

## Stream naming

Use stable names:

```text
switchgear-01
switchgear-02
```

AI configuration references the stream name.

## Data flow

```text
RTSP Camera
    |
    v
MediaMTX
  /   \
 /     \
v       v
AI     WebRTC
       |
       v
    Angular
```

## AI connection

The AI worker should connect to the MediaMTX RTSP stream rather than directly connecting to every camera when possible.

Example conceptual URL:

```text
rtsp://mediamtx:8554/switchgear-01
```

Use configuration instead of hard-coded values.

## Browser connection

The Angular application receives the browser-compatible MediaMTX stream.

Do not route video through ASP.NET.

## Reconnection

AI worker must reconnect with exponential backoff.

Recommended behavior:

```text
1s
2s
4s
8s
max 30s
```

Reset backoff after successful stable connection.

## Stale frame handling

If the decoder is slower than the camera:
- keep latest frame
- drop stale frames
- do not grow an unbounded queue

## Camera status

Track:

```text
ONLINE
DEGRADED
OFFLINE
RECONNECTING
```

Publish status to backend.

## Security

For production:
- do not expose camera credentials in frontend
- isolate MediaMTX ports
- use authenticated streams where supported
- expose only necessary ports
- use TLS where deployment requires it

## Localhost

MediaMTX can run in Docker while the AI worker runs natively.

For native AI:

```text
rtsp://localhost:8554/<stream>
```

For Docker AI:

```text
rtsp://mediamtx:8554/<stream>
```
