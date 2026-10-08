import {chooseDetectorEvidence, rejectDetectorEvidence, type CropEvidence, type DetectorResult} from '@/lib/crop-detector';
import type {InstantDiagnosisFromImageAndSymptomsInput as Input, InstantDiagnosisFromImageAndSymptomsOutput as Report} from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

type Support = Omit<Report, 'crop'|'disease'|'confidence'|'inference'|'modelAssessment'|'cropEvidence'> & {
  review: {applicable:boolean; agrees:boolean; reason:string};
};

export async function resolveDetectorDiagnosis(input: Input, services: {
  detect: (image:string, crop?:string) => Promise<DetectorResult>;
  support: (evidence:CropEvidence) => Promise<Support>;
  fallback: () => Promise<Report>;
}): Promise<Report> {
  let evidence = chooseDetectorEvidence(await services.detect(input.photoDataUri, input.crop), input.crop);
  if (evidence.accepted) {
    const {review, ...support} = await services.support(evidence);
    if (review.applicable && review.agrees) {
      const accepted = evidence.accepted;
      const healthy = accepted.disease === 'Healthy';
      return {
        ...support,
        // Fixed detector fields win even if an unexpected support response contains them.
        crop: accepted.crop, disease: accepted.disease, confidence: accepted.score,
        cropEvidence: {...evidence, reviewReason:review.reason},
        ...(healthy ? {severity:'None',severityScore:0,affectedParts:[],visualHighlights:[],plan:undefined,protectionPlan:undefined} : {}),
      };
    }
    evidence = rejectDetectorEvidence(evidence, review.reason);
  }
  return {...await services.fallback(), cropEvidence:evidence};
}
