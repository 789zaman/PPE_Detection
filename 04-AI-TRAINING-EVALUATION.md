# AI Training and Evaluation

## Dataset rules

Use YOLO detection format.

Keep:

```text
dataset/
  images/
    train/
    val/
    test/
  labels/
    train/
    val/
    test/
  data.yaml
```

## Label quality

Before changing architecture, audit labels.

Required checks:
- missing boxes
- wrong class
- duplicate boxes
- boxes covering wrong object
- inconsistent goggles labels
- inconsistent gloves labels
- arc shield confusion with suit
- person boxes missing where required by association logic
- severe truncation/occlusion cases

Bad labels can cap performance regardless of model size.

## Train candidate

Initial candidate:

```text
yolo11s.pt
```

Do not assume one training configuration is optimal.

Start with a controlled baseline and record all parameters.

## Suggested starting experiment

```text
imgsz: 960
epochs: 100-200
batch: auto
patience: 30
device: 0
```

Tune based on GPU memory.

Do not blindly use 960 if small-object recall does not improve enough to justify latency.

## Evaluation report

Generate:

```text
reports/
  model_summary.json
  per_class_metrics.csv
  confusion_matrix.png
  validation_examples/
  live_video_metrics.json
```

## Production acceptance

Do not accept a model because mAP is high.

Require a recorded-CCTV test containing:
- front views
- side views
- rear views
- different distances
- different lighting
- workers partially occluded
- similar-color arc suit/gloves
- shield present/absent
- goggles present/absent
- empty switchgear room
- equipment/background patterns

## False-positive evaluation

Record false positives per camera hour.

Examples:
- equipment interpreted as person
- background interpreted as PPE
- suit interpreted as shield
- gloves interpreted as suit
- reflections interpreted as goggles
- helmet hallucinations

## Live validation command

The AI service must support a validation recording mode.

Example:

```text
record:
  enabled: true
  duration_seconds: 300
  output_dir: ./validation-recordings
```

Store:
- original video
- annotated video
- JSON events
- frame-level detection log
- final metrics

This lets the team evaluate the same real camera path instead of relying only on training metrics.

## Threshold tuning

Tune thresholds using a held-out validation set and recorded CCTV.

Do not tune on the exact footage used to report final performance.

Use class-specific thresholds.

Example:

```yaml
thresholds:
  helmet: 0.20
  goggles: 0.15
  arc_suit: 0.20
  arc_flash_shield: 0.15
  arc_gloves: 0.15
```

Then separately tune temporal confirmation.

## Important distinction

Detection threshold:

```text
Should YOLO candidate be considered?
```

Violation threshold:

```text
Should the system create a compliance violation?
```

These must not be the same concept.
