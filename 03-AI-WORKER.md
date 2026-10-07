# AI Worker

## Technology

- Python 3.11+ recommended
- Ultralytics
- PyTorch
- OpenCV
- ByteTrack
- Pydantic
- NATS client
- structured logging

## Default model

```text
YOLO8s
```

The checkpoint path must be configurable:

```text
MODEL_PATH=/models/ppe-yolo11s.pt
```

Never hard-code a developer machine path.

## Detection classes

The implementation must support configurable class names. Initial expected classes:

```text
person
helmet
goggles
arc_suit
arc_flash_shield
arc_gloves
```

Do not assume class IDs. Resolve IDs from model names/configuration.

## Inference pipeline

```text
RTSP
 |
 v
Frame capture
 |
 v
Frame sampling / latest-frame strategy
 |
 v
YOLO inference
 |
 v
candidate detections
 |
 v
ByteTrack
 |
 v
person tracks
 |
 v
PPE association
 |
 v
temporal state
 |
 v
compliance rules
 |
 v
violation event
```



## Important

A low YOLO confidence threshold must not mean an immediate violation.

Use:

```text
candidate threshold
        +
tracking
        +
temporal confirmation
        =
violation
```

## Temporal confirmation

Use configurable values:

```yaml
temporal:
  min_consecutive_frames: 3
  confirmation_window_ms: 1500
  clear_consecutive_frames: 5
```

Implement hysteresis.

Example:

```text
3 positive observations -> OPEN
5 negative observations -> RESOLVED
```

Allow configuration to use observation counts rather than assuming every frame is processed.

## PPE association

Associate PPE detections with person tracks using:
- bounding-box overlap
- relative position
- class-specific geometry
- configurable IoU/containment thresholds

Do not use only nearest-center distance.

Recommended regions:

```text
helmet -> upper head region
goggles -> face region
arc_gloves -> hand/arm region
arc_suit -> torso/body region
arc_flash_shield -> face/body/held-object region depending on annotation design
```

The association logic must be isolated in its own module and unit tested.

## Arc PPE compliance

Current rule:

```text
if arc_flash_shield is reliably present:
    compliant

else if arc_flash_shield is reliably absent:
    one Arc PPE violation

Do not create separate Arc violations for:
    arc_suit
    arc_gloves
```

Do not remove helmet/goggles rules.

## Camera zones

Support a persisted camera configuration.

The AI worker must load:
- camera ID
- RTSP URL
- enabled flag
- zones
- class thresholds
- temporal settings

Do not require the user to manually redraw a zone every time the application restarts.

## Snapshot policy

Capture a snapshot only for:
- violation creation
- optionally violation resolution
- HITL evidence

Do not save every inference frame.

Use JPEG/WebP with configurable quality.

## Performance

The live loop must not block indefinitely.

Preferred design:

```text
capture thread/task
      |
      v
latest-frame buffer
      |
      v
inference worker
```

If inference is slower than camera FPS, drop stale frames rather than building an unbounded queue.

## Metrics

Expose:
- FPS input
- FPS inference
- inference latency
- queue/drop count
- active tracks
- detections/frame
- violations/minute
- GPU memory if available
- worker uptime
- camera reconnect count

## Model evaluation

The production model cannot be selected using COCO benchmark numbers.

Evaluate:
- precision
- recall
- mAP50
- mAP50-95
- per-class recall
- false positives per hour
- missed violations per hour
- latency
- FPS

Give special attention to:
- goggles
- arc gloves
- arc flash shield

because they are small or visually similar to other PPE.

```
compare
YOLOv8s
yolov11s
```

Use the same:
- train/validation/test split
- image size
- augmentation policy
- seed where practical
- evaluation script
- recorded CCTV clips

The live model should be selected based on the project's actual metrics and deployment constraints.
