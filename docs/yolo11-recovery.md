# Reproducible YOLO11 build recovery

The old YOLO11m PlantDoc checkpoint URL now returns HTTP 404. Existing production
inference still worked: a fresh copy-site maize rust regression returned 90.19%
in 0.93 seconds. The fault prevented new builds, including the marketplace fix.

New builds use JK-TK/PlantDiseaseDetection revision
`ee651406dd0b0bc9aa0458834f28316fc34b4435`, a YOLO11x checkpoint with 116 crop/condition
classes. This is an integration of a published model, not a model trained by this
project and not proof of higher real-world accuracy. Source and exact checksums
are in `models/plant-disease/manifest.json`.

The exporter verifies the 457,175,703-byte source checkpoint, uses PyTorch's
restricted `weights_only=True` loader with an explicit list of official Torch and
Ultralytics classes, verifies all 116 label IDs against the checked-in mapping,
and exports with pinned CPU tools. It never imports publisher Python files.
FP16 weights keep float32 inputs/outputs and produce a 114,208,511-byte ONNX file.
A second export in a different working directory reproduced the exact SHA-256.
Every build checks the artifact hash and size; a missing or changed artifact fails
the build. Verified model caching uses `.next/cache/agriguard-models`.

Both models are packaged locally in diagnosis functions. End-user images are not
sent to Hugging Face; it supplies build-time weights only. No additional paid API,
GPU service or subscription is configured. Existing Vercel and Gemini quotas apply.

The 80% candidate gate, selected-crop agreement and independent Gemini image review
remain. General symptom labels such as yellowing, brown spots and unspecified insect
damage cannot become a definitive model diagnosis. Duplicate class IDs with the
same crop/condition may agree; competing crops/conditions are rejected. Model boxes
are detection regions, not measured disease area. Wheat, mango and cotton remain
outside this detector's classes; DaViT/Gemini continue to handle these cases.

Existing YOLO11m report records remain valid and retain their original model label.
New reports identify YOLO11x accurately. DaViT is unchanged and still runs when a
YOLO candidate is not accepted. No score threshold was reduced and no model success
is fabricated.

## Verification

- Eight public leaf fixtures and a solid-color negative control, FP32 versus FP16:
  same top labels, maximum observed score difference below 0.2 percentage points;
  the negative control had no qualifying detection.
- New maize rust candidate: 97.71%; healthy tomato candidate: 84.57%; laboratory
  potato late-blight candidate: 89.89%. Scores are not measured accuracy.
- Some inputs still abstain; a PlantDoc potato folder-label disagreement remains.
  Full results are recorded in `yolo11-recovery-benchmark.json`.
- Actual combined YOLO11x and DaViT CPU inference: peak resident memory 1,221 MiB.
- TypeScript passed; 83 tests passed, two emulator-only tests skipped.
- Deployment and signed-in checks must be recorded after the release is Ready.

Publisher model card: https://huggingface.co/JK-TK/PlantDiseaseDetection
Ultralytics model code: https://github.com/ultralytics/ultralytics
The publisher card's MIT notice does not supersede Ultralytics' AGPL-3.0 terms.
