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
    return unavailable('Choose two reports of the same plant.', previous, current);
  }
  if (previous.id === current.id) return unavailable('Choose two different tests.', previous, current);
  const beforeTime = Date.parse(previous.createdAt), afterTime = Date.parse(current.createdAt);
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime) || beforeTime >= afterTime) {
    return unavailable('The earlier test needs a valid date before the newer test.', previous, current);
  }
  if (previous.status !== 'Complete' || current.status !== 'Complete' || !previous.diagnosis || !current.diagnosis) {
    return unavailable('Both reports must be ready before you can compare them.', previous, current);
  }
  const before = previous.diagnosis, after = current.diagnosis;
  if ([before.disease, before.crop, after.disease, after.crop].some(value => INVALID_SUBJECTS.has(labelKey(value)))) {
    return unavailable('One photo could not be checked. Add a clear photo of this crop.', previous, current);
  }
  const previousScore = validSeverityScore(previous.severityScore), currentScore = validSeverityScore(current.severityScore);
  const numeric = previousScore !== null && currentScore !== null;
  const categoryValid = Object.hasOwn(CATEGORY_RANK, before.severity) && Object.hasOwn(CATEGORY_RANK, after.severity);
  const change = numeric ? currentScore - previousScore : null;
  const difference = change ?? (categoryValid ? CATEGORY_RANK[after.severity] - CATEGORY_RANK[before.severity] : null);
  const direction: ProgressDirection = difference === null ? 'unavailable' : difference < 0 ? 'improving' : difference > 0 ? 'worsening' : 'unchanged';
  const reviewReasons: string[] = [];
  if ([before, after].some(result => result.expertReviewRequired || !Number.isFinite(result.confidence) || result.confidence < 70 || result.confidence > 100)) {
    reviewReasons.push('One result is uncertain. Ask a crop expert to check it before relying on this change.');
  }
  if ([before, after].some(result => !labelKey(result.disease) || UNKNOWN_DIAGNOSES.has(labelKey(result.disease)))) {
    reviewReasons.push('One report could not identify the problem. A change in damage does not tell us its cause.');
  }
  if ([{ diagnosis: before, score: previousScore }, { diagnosis: after, score: currentScore }].some(({ diagnosis, score }) => {
    if (score === null) return false;
    const expected = score === 0 ? 'None' : score <= 33 ? 'Low' : score <= 66 ? 'Medium' : 'High';
    return diagnosis.severity !== expected;
  })) reviewReasons.push('The damage score and level do not match. Check both reports.');
  if ([before, after].some(result => HEALTHY_DIAGNOSES.has(labelKey(result.disease)) !== (result.severity === 'None'))) {
    reviewReasons.push('The problem name and damage level do not match. Check both reports.');
  }

  const title = direction === 'improving' ? (reviewReasons.length ? 'Possible improvement' : 'Improving')
    : direction === 'worsening' ? (reviewReasons.length ? 'Possible worsening' : 'Worsening')
    : direction === 'unchanged' ? (numeric ? 'Damage level is the same' : 'Damage level is the same') : 'Damage could not be compared';
  const summary = numeric
    ? change === 0 ? `Both reports have an estimated damage score of ${currentScore}/100.`
      : `Estimated damage ${change! < 0 ? 'fell' : 'rose'} from ${previousScore}/100 to ${currentScore}/100 — ${Math.abs(change!)} point${Math.abs(change!) === 1 ? '' : 's'} ${change! < 0 ? 'lower' : 'higher'}.`
    : categoryValid ? `Damage level: ${before.severity} → ${after.severity}. No score was saved for one or both reports.`
      : 'A damage score or level is missing. You can still read both reports below.';

  const beforeKey = labelKey(before.disease), afterKey = labelKey(after.disease);
  const unknown = !beforeKey || !afterKey || UNKNOWN_DIAGNOSES.has(beforeKey) || UNKNOWN_DIAGNOSES.has(afterKey);
  const healthy = (result: typeof before, score: number | null) => HEALTHY_DIAGNOSES.has(labelKey(result.disease)) && result.severity === 'None' && (score === null || score === 0) && !(result.affectedParts || []).length;
  const beforeHealthy = !unknown && healthy(before, previousScore), afterHealthy = !unknown && healthy(after, currentScore);
  let diagnosisTitle: string, diagnosisSummary: string;
  if (unknown) {
    diagnosisTitle = 'The cause is still unclear';
    diagnosisSummary = 'The cause is unclear, so these reports cannot tell us if the old problem is gone.';
  } else if (beforeHealthy && afterHealthy) {
    diagnosisTitle = 'No visible damage found';
    diagnosisSummary = 'Both reports show no visible damage.';
  } else if (afterHealthy) {
    diagnosisTitle = 'Earlier problem not detected now';
    diagnosisSummary = `The earlier report showed “${before.disease}”. The newer photo shows no visible damage. This does not prove full recovery.`;
  } else if (beforeHealthy) {
    diagnosisTitle = 'A new problem was found';
    diagnosisSummary = `The earlier report showed no visible damage. The newer report shows “${after.disease}”.`;
  } else if (beforeKey === afterKey) {
    diagnosisTitle = 'The problem is still there';
    diagnosisSummary = `“${after.disease}” appears in both reports${direction === 'improving' ? ', with less estimated damage now' : direction === 'worsening' ? ', with more estimated damage now' : ''}.`;
  } else {
    diagnosisTitle = 'The problem name changed';
    diagnosisSummary = `The report changed from “${before.disease}” to “${after.disease}”. A different problem name does not prove that the old problem is gone.`;
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

/** Compare only explicitly linked checks of one plant in one crop cycle. */
export function recordsInCareSeason(
  records: PlantRecord[],
  reports: { id: string; careSeasonId: string; cropId: string; plantId: string }[],
  seasonId: string,
  cropId: string,
  plantId: string,
): PlantRecord[] {
  if (!seasonId || !cropId || !plantId) return [];
  const ids = new Set(reports.filter(report =>
    report.careSeasonId === seasonId && report.cropId === cropId && report.plantId === plantId
  ).map(report => report.id));
  return records.filter(record => record.cropId === cropId && record.plantId === plantId && ids.has(record.reportId));
}
