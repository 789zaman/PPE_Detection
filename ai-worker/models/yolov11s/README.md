# YOLOv11s baseline

Default detection baseline. This folder does not contain trained weights.

## Weights

Place the trained checkpoint at:

```text
ai-worker/models/yolov11s/weights/best.pt
```

Docker mounts `ai-worker/models` at `/models`. The container path is:

```text
/models/yolov11s/weights/best.pt
```

## Selection

```text
MODEL_NAME=yolov11s
AI_MODE=production
```

`AI_MODE=mock` does not load this file. The rest of the worker uses the same `ModelProvider` interface for mock, YOLOv11s, and YOLOv8s.

## Inference settings

Configured in `config/model.yaml` and overridable with environment variables:

| Setting | Default |
| --- | --- |
| Image size | 960 (`IMGSZ`) |
| Confidence | 0.25 (`CONFIDENCE`) |
| IoU | 0.45 (`IOU`) |
| Device | `cpu` (`DEVICE`, use `cuda` or `0` with the GPU profile) |

Class ids come from the `classes` list in `config/model.yaml`. Do not hard-code ids in the pipeline.

Canonical PPE names after alias normalization:

```text
person, helmet, goggles, arc_suit, arc_flash_shield, arc_gloves, boots
```

`arc_shield` from the model is normalized to `arc_flash_shield`.
