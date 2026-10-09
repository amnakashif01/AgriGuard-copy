import {chooseDetectorEvidence, chooseClassifierEvidence, rejectDetectorEvidence, type CropEvidence, type DetectorResult} from '@/lib/crop-detector';
import type { ClassifierResult } from '@/lib/crop-classifier';
import type {InstantDiagnosisFromImageAndSymptomsInput as Input, InstantDiagnosisFromImageAndSymptomsOutput as Report} from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

type Support = Omit<Report, 'crop'|'disease'|'confidence'|'inference'|'modelAssessment'|'cropEvidence'> & {
  review: {applicable:boolean; agrees:boolean; reason:string};
};

export async function resolveDetectorDiagnosis(input: Input, services: {
  detect: (image:string, crop?:string) => Promise<DetectorResult>;
  classify?: (image:string) => Promise<ClassifierResult>;
  support: (evidence:CropEvidence) => Promise<Support>;
  fallback: () => Promise<Report>;
}): Promise<Report> {
  let evidence = chooseDetectorEvidence(await services.detect(input.photoDataUri, input.crop), input.crop);
  // Preserve an existing strong leaf diagnosis. Only run the broader model when
  // the leaf model abstains or its image review rejects the candidate.
  for (let attempt = 0; attempt < (services.classify ? 2 : 1); attempt++) {
    if (attempt === 1 && services.classify) evidence = chooseClassifierEvidence(evidence, await services.classify(input.photoDataUri), input.crop);
    if (evidence.accepted) {
      const {review, ...support} = await services.support(evidence);
      if (review.applicable && review.agrees) {
        const accepted = evidence.accepted;
        const healthy = accepted.disease === 'Healthy';
        return {
          ...support,
          // Fixed model fields win even if an unexpected support response contains them.
          crop: accepted.crop, disease: accepted.disease, confidence: accepted.score,
          cropEvidence: {...evidence, reviewReason:review.reason},
          ...(healthy ? {severity:'None',severityScore:0,affectedParts:[],visualHighlights:[],plan:undefined,protectionPlan:undefined} : {}),
        };
      }
      evidence = rejectDetectorEvidence(evidence, review.reason);
    }
  }
  return {...await services.fallback(), cropEvidence:evidence};
}
