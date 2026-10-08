import { z } from 'zod';

export const DETECTOR_REVISION = '8dce599ce0122b304b1fff3cb0d58c90e1f44805';
export const DETECTOR_SOURCE = `https://github.com/dovh25/plantdoc-live-demo/tree/${DETECTOR_REVISION}`;
export const DETECTOR_MIN_SCORE = 80;
export const DETECTOR_CLASSES = [
  ['Apple Scab Leaf','Apple','Apple Scab'], ['Apple leaf','Apple','Healthy'], ['Apple rust leaf','Apple','Cedar Apple Rust'],
  ['Bell_pepper leaf','Bell Pepper','Healthy'], ['Bell_pepper leaf spot','Bell Pepper','Bacterial Leaf Spot'],
  ['Blueberry leaf','Blueberry','Healthy'], ['Cherry leaf','Cherry','Healthy'],
  ['Corn Gray leaf spot','Maize','Gray Leaf Spot'], ['Corn leaf blight','Maize','Northern Leaf Blight'], ['Corn rust leaf','Maize','Common Rust'],
  ['Peach leaf','Peach','Healthy'], ['Potato leaf','Potato','Healthy'], ['Potato leaf early blight','Potato','Early Blight'], ['Potato leaf late blight','Potato','Late Blight'],
  ['Raspberry leaf','Raspberry','Healthy'], ['Soyabean leaf','Soybean','Healthy'], ['Squash Powdery mildew leaf','Squash','Powdery Mildew'], ['Strawberry leaf','Strawberry','Healthy'],
  ['Tomato Early blight leaf','Tomato','Early Blight'], ['Tomato Septoria leaf spot','Tomato','Septoria Leaf Spot'], ['Tomato leaf','Tomato','Healthy'],
  ['Tomato leaf bacterial spot','Tomato','Bacterial Spot'], ['Tomato leaf late blight','Tomato','Late Blight'], ['Tomato leaf mosaic virus','Tomato','Mosaic Virus'],
  ['Tomato leaf yellow virus','Tomato','Yellow Leaf Curl Virus'], ['Tomato mold leaf','Tomato','Leaf Mold'], ['Tomato two spotted spider mites leaf','Tomato','Two-spotted Spider Mites'],
  ['grape leaf','Grape','Healthy'], ['grape leaf black rot','Grape','Black Rot'],
] as const;

export const LeafDetectionSchema = z.object({
  classId: z.number().int().min(0).max(28), label: z.string(), score: z.number().min(0).max(100),
  // Leaf/object boxes, NOT lesion masks or a severity measurement.
  box: z.tuple([z.number().min(0).max(1000),z.number().min(0).max(1000),z.number().min(0).max(1000),z.number().min(0).max(1000)]).describe('Normalized [ymin,xmin,ymax,xmax] from 0 to 1000, enclosing a leaf region.'),
});
export const DetectorResultSchema = z.object({
  model: z.literal('YOLO11m PlantDoc'), revision: z.literal(DETECTOR_REVISION),
  status: z.enum(['detected','unsupported','unavailable']), elapsedMs: z.number().nonnegative(),
  detections: z.array(LeafDetectionSchema).max(16),
});
export type DetectorResult = z.infer<typeof DetectorResultSchema>;
export type LeafDetection = z.infer<typeof LeafDetectionSchema>;
export const CropEvidenceSchema = z.object({
  version: z.literal(2), route: z.enum(['model_assisted','gemini_fallback']),
  reason: z.string(), detector: DetectorResultSchema,
  accepted: z.object({crop:z.string(),disease:z.string(),score:z.number(),label:z.string()}).optional(),
  reviewReason: z.string().optional(),
  severitySource: z.literal('Gemini visual estimate'), highlightsSource: z.literal('Gemini visual estimate'),
});
export type CropEvidence = z.infer<typeof CropEvidenceSchema>;

export function canonicalCrop(value?: string): string | undefined {
  const v=value?.trim().toLowerCase();
  if(!v || ['auto','auto-detect','unknown','unknown crop','other','crop to be identified'].includes(v)) return undefined;
  const aliases:Record<string,string>={'corn':'Maize','corn (maize)':'Maize','maize (corn)':'Maize','soyabean':'Soybean','pepper bell':'Bell Pepper','bell_pepper':'Bell Pepper'};
  return aliases[v] || DETECTOR_CLASSES.find(c=>c[1].toLowerCase()===v)?.[1] || value!.trim();
}
export function detectorSupportsCrop(value?: string) {
  const crop=canonicalCrop(value); return !crop || DETECTOR_CLASSES.some(c=>c[1]===crop);
}
export function chooseDetectorEvidence(result:DetectorResult, selectedCrop?:string):CropEvidence {
  const base:CropEvidence={version:2,route:'gemini_fallback',reason:'The specialized model did not confidently recognize this condition.',detector:result,severitySource:'Gemini visual estimate',highlightsSource:'Gemini visual estimate'};
  if(result.status==='unsupported') return {...base,reason:'This crop is outside the specialized detector’s trained categories. Gemini reviewed the image.'};
  if(result.status==='unavailable') return {...base,reason:'The specialized detector was unavailable. Gemini reviewed the image.'};
  const high=result.detections.filter(d=>d.score>=DETECTOR_MIN_SCORE);
  if(!high.length)return base;
  const crop=canonicalCrop(selectedCrop);
  if(crop && high.some(d=>DETECTOR_CLASSES[d.classId]?.[1]!==crop))return {...base,reason:'The model prediction did not match the selected crop. Gemini reviewed the image.'};
  if(new Set(high.map(d=>d.classId)).size!==1)return {...base,reason:'The detector returned conflicting conditions. Gemini reviewed the image.'};
  const top=high.reduce((a,b)=>a.score>b.score?a:b);
  const entry=DETECTOR_CLASSES[top.classId];
  if(!entry || entry[0]!==top.label)return {...base,reason:'The detector label could not be validated. Gemini reviewed the image.'};
  return {...base,route:'model_assisted',reason:'The detector supplied the diagnosis; Gemini checked the image and prepared the care report.',accepted:{crop:entry[1],disease:entry[2],score:top.score,label:top.label}};
}

export function rejectDetectorEvidence(evidence:CropEvidence, reason:string):CropEvidence {
  const {accepted:_,...rest}=evidence;
  return {...rest,route:'gemini_fallback',reason:'The specialized model prediction was not confirmed by image review. Gemini provided this assessment.',reviewReason:reason};
}
