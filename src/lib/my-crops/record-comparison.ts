import { cleanName, nameKey, type PlantRecord } from './models';

export type ProgressDirection = 'improving' | 'worsening' | 'unchanged' | 'unavailable';
export type RecordComparison = {
  direction: ProgressDirection;
  basis: 'score' | 'category' | 'unavailable';
  title: string;
  summary: string;
  previousScore: number | null;
  currentScore: number | null;
  change: number | null;
  diagnosisTitle: string;
  diagnosisSummary: string;
  parts: { added: string[]; removed: string[]; continuing: string[] };
  reviewReasons: string[];
};

const CATEGORY_RANK: Record<string, number> = { None: 0, Low: 1, Medium: 2, High: 3 };
const UNKNOWN_DIAGNOSES = new Set(['unknown disease', 'unidentified issue', 'unknown', 'نامعلوم بیماری', 'نامعلوم مسئلہ']);
const INVALID_SUBJECTS = new Set(['not a crop', 'not a plant', 'unknown crop', 'non plant', 'non plant image', 'not a plant or crop', 'unrecognizable', 'نامعلوم فصل']);
const HEALTHY_DIAGNOSES = new Set(['healthy', 'healthy plant', 'healthy crop', 'no disease', 'no disease detected', 'صحت مند', 'صحت مند پودا', 'صحت مند فصل', 'صحتمند', 'تندرست']);

function labelKey(value: string | undefined): string {
  return nameKey(value || '').replace(/[.!؟۔]+$/u, '').replace(/[-_]+/g, ' ');
}

export function validSeverityScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

/** Capture order matters: retrying an old analysis must not make it the newest photo. */
export function completedPlantRecords(records: PlantRecord[], cropId: string, plantId: string): PlantRecord[] {
  return records
    .filter(record => record.status === 'Complete' && record.cropId === cropId && record.plantId === plantId)
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt), bTime = Date.parse(b.createdAt);
      if (!Number.isFinite(aTime)) return Number.isFinite(bTime) ? -1 : a.id.localeCompare(b.id);
      if (!Number.isFinite(bTime)) return 1;
      return aTime - bTime || a.id.localeCompare(b.id);
    });
}

export function partMap(parts: string[] | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of parts || []) {
    const label = cleanName(part);
    const key = nameKey(label).replace(/^leaves$/, 'leaf').replace(/^(stems|roots|fruits|flowers|seeds|branches)$/, match => match === 'branches' ? 'branch' : match.slice(0, -1));
    if (key) result.set(key, label);
  }
  return result;
}

function unavailable(reason: string, previous: PlantRecord, current: PlantRecord): RecordComparison {
  return {
    direction: 'unavailable', basis: 'unavailable', title: 'Comparison unavailable', summary: reason,
    previousScore: validSeverityScore(previous.severityScore), currentScore: validSeverityScore(current.severityScore),
    change: null, diagnosisTitle: '', diagnosisSummary: '',
    parts: { added: [], removed: [], continuing: [] }, reviewReasons: [],
  };
}

/** A read-only comparison of saved assessments; no new diagnosis or inferred cure. */
export function comparePlantRecords(previous: PlantRecord, current: PlantRecord): RecordComparison {
  if (!previous.cropId || !previous.plantId || previous.cropId !== current.cropId || previous.plantId !== current.plantId) {
    return unavailable('Choose two records of the same plant.', previous, current);
  }
  if (previous.id === current.id) return unavailable('Choose two different tests.', previous, current);
  const beforeTime = Date.parse(previous.createdAt), afterTime = Date.parse(current.createdAt);
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime) || beforeTime >= afterTime) {
    return unavailable('The earlier test needs a valid date before the newer test.', previous, current);
  }
  if (previous.status !== 'Complete' || current.status !== 'Complete' || !previous.diagnosis || !current.diagnosis) {
    return unavailable('Both tests need completed analyses before their results can be compared.', previous, current);
  }
  const before = previous.diagnosis, after = current.diagnosis;
  if ([before.disease, before.crop, after.disease, after.crop].some(value => INVALID_SUBJECTS.has(labelKey(value)))) {
    return unavailable('One of these analyses could not identify a usable crop image. Add a clear photo of this plant.', previous, current);
  }
  const previousScore = validSeverityScore(previous.severityScore), currentScore = validSeverityScore(current.severityScore);
  const numeric = previousScore !== null && currentScore !== null;
  const categoryValid = Object.hasOwn(CATEGORY_RANK, before.severity) && Object.hasOwn(CATEGORY_RANK, after.severity);
  const change = numeric ? currentScore - previousScore : null;
  const difference = change ?? (categoryValid ? CATEGORY_RANK[after.severity] - CATEGORY_RANK[before.severity] : null);
  const direction: ProgressDirection = difference === null ? 'unavailable' : difference < 0 ? 'improving' : difference > 0 ? 'worsening' : 'unchanged';
  const reviewReasons: string[] = [];
  if ([before, after].some(result => result.expertReviewRequired || !Number.isFinite(result.confidence) || result.confidence < 70 || result.confidence > 100)) {
    reviewReasons.push('At least one diagnosis needs expert review or has low confidence. Treat the trend as tentative.');
  }
  if ([before, after].some(result => !labelKey(result.disease) || UNKNOWN_DIAGNOSES.has(labelKey(result.disease)))) {
    reviewReasons.push('A cause has not been identified in at least one test; a severity change does not confirm what caused it.');
  }
  if ([{ diagnosis: before, score: previousScore }, { diagnosis: after, score: currentScore }].some(({ diagnosis, score }) => {
    if (score === null) return false;
    const expected = score === 0 ? 'None' : score <= 33 ? 'Low' : score <= 66 ? 'Medium' : 'High';
    return diagnosis.severity !== expected;
  })) reviewReasons.push('A saved severity score and its category disagree. Review the reports before drawing a conclusion.');
  if ([before, after].some(result => HEALTHY_DIAGNOSES.has(labelKey(result.disease)) !== (result.severity === 'None'))) {
    reviewReasons.push('A diagnosis label and its symptom category do not agree. Check the saved analyses.');
  }

  const title = direction === 'improving' ? (reviewReasons.length ? 'Possible improvement' : 'Improving')
    : direction === 'worsening' ? (reviewReasons.length ? 'Possible worsening' : 'Worsening')
    : direction === 'unchanged' ? (numeric ? 'No change in severity' : 'Same severity category') : 'Severity trend unavailable';
  const summary = numeric
    ? change === 0 ? `Both tests have an estimated severity of ${currentScore}/100.`
      : `Estimated severity ${change! < 0 ? 'fell' : 'rose'} from ${previousScore}/100 to ${currentScore}/100 — ${Math.abs(change!)} point${Math.abs(change!) === 1 ? '' : 's'} ${change! < 0 ? 'lower' : 'higher'}.`
    : categoryValid ? `Severity category: ${before.severity} → ${after.severity}. A numeric score is missing, so an exact point change is unavailable.`
      : 'A comparable severity score or category is missing. The saved diagnoses are shown below.';

  const beforeKey = labelKey(before.disease), afterKey = labelKey(after.disease);
  const unknown = !beforeKey || !afterKey || UNKNOWN_DIAGNOSES.has(beforeKey) || UNKNOWN_DIAGNOSES.has(afterKey);
  const healthy = (result: typeof before, score: number | null) => HEALTHY_DIAGNOSES.has(labelKey(result.disease)) && result.severity === 'None' && (score === null || score === 0) && !(result.affectedParts || []).length;
  const beforeHealthy = !unknown && healthy(before, previousScore), afterHealthy = !unknown && healthy(after, currentScore);
  let diagnosisTitle: string, diagnosisSummary: string;
  if (unknown) {
    diagnosisTitle = 'Cause still needs confirmation';
    diagnosisSummary = 'An unknown or unidentified issue cannot be marked as resolved or matched to a new disease from these labels alone.';
  } else if (beforeHealthy && afterHealthy) {
    diagnosisTitle = 'No visible symptoms reported';
    diagnosisSummary = 'Both saved analyses report no visible symptoms.';
  } else if (afterHealthy) {
    diagnosisTitle = 'Earlier issue not detected in the newer test';
    diagnosisSummary = `The earlier test reported “${before.disease}”. The newer analysis reports no visible symptoms; this does not confirm that the condition is cured.`;
  } else if (beforeHealthy) {
    diagnosisTitle = 'New issue reported';
    diagnosisSummary = `The earlier test reported no visible symptoms. The newer test reports “${after.disease}”.`;
  } else if (beforeKey === afterKey) {
    diagnosisTitle = 'Issue still reported';
    diagnosisSummary = `“${after.disease}” appears in both tests${direction === 'improving' ? ', with lower estimated severity in the newer test' : direction === 'worsening' ? ', with higher estimated severity in the newer test' : ''}.`;
  } else {
    diagnosisTitle = 'Reported diagnosis changed';
    diagnosisSummary = `The report changed from “${before.disease}” to “${after.disease}”. A different label does not prove the earlier condition has resolved or that the new condition has just appeared.`;
  }
  const beforeParts = partMap(before.affectedParts), afterParts = partMap(after.affectedParts);
  return {
    direction, basis: numeric ? 'score' : categoryValid ? 'category' : 'unavailable', title, summary,
    previousScore, currentScore, change, diagnosisTitle, diagnosisSummary, reviewReasons,
    parts: {
      added: [...afterParts].filter(([key]) => !beforeParts.has(key)).map(([, label]) => label),
      removed: [...beforeParts].filter(([key]) => !afterParts.has(key)).map(([, label]) => label),
      continuing: [...afterParts].filter(([key]) => beforeParts.has(key)).map(([, label]) => label),
    },
  };
}
