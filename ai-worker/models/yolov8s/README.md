# YOLOv8s baseline

Interchangeable baseline. This folder does not contain trained weights.

## Weights

Place the trained checkpoint at:

```text
ai-worker/models/yolov8s/weights/best.pt
```

Docker path:

```text
/models/yolov8s/weights/best.pt
```

## Selection

```text
MODEL_NAME=yolov8s
AI_MODE=production
```

No application code changes are required. `YoloV8sProvider` implements the same `ModelProvider` interface as YOLOv11s.

## Inference settings

Same keys as YOLOv11s. See `config/model.yaml`.

| Setting | Default |
| --- | --- |
| Image size | 960 |
| Confidence | 0.25 |
| IoU | 0.45 |
| Device | cpu |

Class names and aliases match the YOLOv11s baseline so compliance rules stay model-agnostic.
