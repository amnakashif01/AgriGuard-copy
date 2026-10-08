# Crop detector and report pipeline

The default `hybrid` provider now runs **YOLO11m PlantDoc** on the server CPU.
This is an integration of an existing pretrained detector, not a model trained by
this project. MobileNetV2 is retained only for reading legacy reports and its old
benchmark; it is no longer the active hybrid diagnosis model.

## Verified artifact

- Source: https://github.com/dovh25/plantdoc-live-demo
- Pinned revision: `8dce599ce0122b304b1fff3cb0d58c90e1f44805`
- Artifact: `training/plantdoc_yolo/weights/best.onnx`
- Bytes: 80,515,434. SHA-256: `17c9e8ef5151e4018a015a5c78e04cfae7288a3b097a9b26f5c0f77fac85c191`
- Embedded metadata identifies Ultralytics YOLO11m, 29 leaf categories, AGPL-3.0.
  The upstream application's MIT notice does not replace the model's AGPL notice.
- Dataset: https://github.com/pratikkayal/PlantDoc-Dataset (CC BY 4.0).
- Model license: https://www.gnu.org/licenses/agpl-3.0.html
- Integration source: https://github.com/amnakashif01/AgriGuard-copy

Build downloads the pinned weights and verifies size and SHA-256. ONNX Runtime
loads them once per warm process. Preprocessing uses RGB, 640-square letterboxing
with padding 114, pixel values divided by 255, then NCHW layout. Output is
`[1,33,8400]`: four box coordinates plus 29 class scores. Class-agnostic NMS uses
IoU 0.45. The labels are copied from the artifact metadata, not inferred from the
README's crop count. Boxes are mapped back to the original image.

The weights remain on the server. Phones do not download them. No new GPU,
inference subscription or paid service is configured. Existing hosting and Gemini
quotas remain applicable; free infrastructure cannot promise unlimited availability.

## One report with an explicit source

1. Run the detector, unless the selected crop is outside its categories.
2. A candidate needs at least 80% score, matching selected crop, valid label mapping,
   and no conflicting high-confidence class. This threshold is a conservative
   engineering gate, not a calibrated probability or guarantee of correctness.
3. For a candidate, Gemini receives the original image and actual detector output.
   It must first independently confirm applicability and agreement. Its support
   schema cannot supply crop, disease, detector score or provenance.
4. If confirmed, the server sets diagnosis identity and score from the detector;
   Gemini provides explanation, care, visible severity estimate and symptom circles.
5. If weak, unsupported or mismatched, skip the support call and use independent
   Gemini diagnosis. If image review rejects a strong candidate, discard its support
   and run independent Gemini diagnosis without passing the rejected label.
6. Persist server-created `cropEvidence` with the report. The UI displays either
   `YOLO11 + Gemini review` or `Gemini fallback`, not two competing diagnoses.

Small JPEG/PNG/WebP uploads (at most 2 MiB) retain their original bytes for
inference. Larger images are resized to width 1280 at JPEG quality 0.92. In a
regression check, re-encoding a maize leaf at JPEG quality 80 reduced its score
from 90.19 to 47.78. This sensitivity is another reason not to claim robust,
validated accuracy. Display thumbnails remain separate from analysis inputs.

Most initial reports use one Gemini request. A strong candidate rejected during
image review needs a second request for independent assessment. Existing optional
image-highlight review is separate. A failure never becomes fabricated model
success. The deterministic diagnosis fields cannot be overwritten by the care writer.

This detector identifies **leaf regions**, not individual lesion boundaries or
segmentation masks. Optional green boxes display actual leaf detections. Red
circles and severity are explicitly labeled Gemini visual estimates; box size and
classifier confidence are never converted into a disease-area percentage.

Wheat, mango, cotton, rice, citrus and other unsupported selections use fallback.
Fall Armyworm is not a trained category even though maize rust/blight are supported.
A high score can still be wrong. Gemini review reduces some failure modes but is
not an expert-validated accuracy guarantee. Both models can agree incorrectly.

Standalone diagnosis has no previous-report comparison. My Crops comparison logic
is unchanged. Legacy report data remains intact; rejected legacy classifier labels
are hidden under model details instead of presented as a second diagnosis.

## Verification and limitations

`crop-detector-benchmark.json` records the real CPU outputs on ten integration
fixtures. Eight public leaf photos, one private maize regression photo and one
solid-colour negative control were tested. The private photo is not distributed.
Ground-truth labels come from dataset folders or the prior report, not independent
expert annotation; train/test overlap is possible. This is not an accuracy study.

On these inputs the detector took about 0.77–1.81 seconds locally, including
preprocessing and first-load overhead. Three candidates passed the score gate;
one was incorrectly classified potato blight at 96.68%, demonstrating why image
review and rejection are mandatory. The private maize image scored 27.41% and
went directly to fallback. The negative control produced no detections.

RT-DETRv2-R18 from Madras1/plantdoc-rtdetrv2-leaf-disease-detector was also tested
on the same inputs. Scores were low (about 9–23%), with incorrect candidates on
several leaves and the negative control. It was not selected. YOLO was selected
as a CPU-compatible leaf-localization candidate with explicit abstention, not as
proof that it is more accurate than Gemini or a universal crop model.

```sh
npm run model:prepare
node --import tsx --test tests/*.test.ts tests/*.test.tsx
npm run build
npm run typecheck
node --import tsx scripts/benchmark-crop-detector.ts /path/to/manifest.json
```

The manifest is an array of `{path, expectedLabel, crop?, url, dataset}`. Public
source URLs are included in the benchmark JSON. Tests exercise crop mismatch,
low scores, conflicts, high-score review rejection, fixed diagnosis identity,
explicit fallback, persisted severity fields, existing report behavior and quotas.

`CROP_DIAGNOSIS_PROVIDER=gemini` opts out of the detector. The separate `agrichat`
provider remains optional and requires an authorized working GPU endpoint; it is
not being claimed as deployed.
