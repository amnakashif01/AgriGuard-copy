import type { PlantRecord } from './models';
import { comparePlantRecords, completedPlantRecords, partMap } from './record-comparison';

/** All completed captures remain available; completion/retry time never reorders them. */
export function plantComparisonHistory(records: PlantRecord[], cropId: string, plantId: string) {
  const complete = completedPlantRecords(records, cropId, plantId);
  const entries = complete.map((record, index) => ({
    record, number: index + 1,
    comparison: index ? comparePlantRecords(complete[index - 1], record) : null,
  }));
  const parts = new Map<string, string>();
  const reportedParts = complete.map(record => {
    const reported = partMap(record.diagnosis?.affectedParts);
    reported.forEach((label, key) => { if (!parts.has(key)) parts.set(key, label); });
    return reported;
  });
  return {
    complete, entries, parts: [...parts], reportedParts,
    overall: complete.length > 1 ? comparePlantRecords(complete[0], complete[complete.length - 1]) : null,
  };
}

/** Resolve against current data so deletion, live additions and older selections stay safe. */
export function resolveComparisonPair(complete: PlantRecord[], testId = '', compareId = '') {
  if (complete.length < 2) return null;
  const selected = complete.find(record => record.id === testId) || complete[complete.length - 1];
  const selectedIndex = complete.indexOf(selected);
  const requested = complete.find(record => record.id === compareId && record.id !== selected.id);
  const against = requested || complete[selectedIndex > 0 ? selectedIndex - 1 : 1];
  const againstIndex = complete.indexOf(against);
  const [earlier, newer] = selectedIndex < againstIndex ? [selected, against] : [against, selected];
  return {
    selected, against, earlier, newer,
    earlierNumber: complete.indexOf(earlier) + 1,
    newerNumber: complete.indexOf(newer) + 1,
    comparison: comparePlantRecords(earlier, newer),
  };
}

export type ComparisonHistory = ReturnType<typeof plantComparisonHistory>;
export type DisplayTest = ComparisonHistory['entries'][number] & { comparisonNote: string };

/** Two tests per view. An odd final page overlaps one test instead of shrinking cards. */
export function comparisonWindow(history: ComparisonHistory, requestedPage = 0, pair: ReturnType<typeof resolveComparisonPair> = null) {
  const pageCount = Math.ceil(history.entries.length / 2);
  const page = Math.min(Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0), Math.max(0, pageCount - 1));
  const start = Math.min(page * 2, Math.max(0, history.entries.length - 2));
  const entries: DisplayTest[] = pair ? [
    { record: pair.earlier, number: pair.earlierNumber, comparison: null, comparisonNote: 'Earlier selected test' },
    { record: pair.newer, number: pair.newerNumber, comparison: pair.comparison, comparisonNote: `Compared with Test ${pair.earlierNumber}` },
  ] : history.entries.slice(start, start + 2).map(entry => ({
    ...entry, comparisonNote: entry.number > 1 ? `Compared with Test ${entry.number - 1}` : 'First saved test',
  }));
  const parts = new Map<string, string>();
  const reportedParts = entries.map(({ record }) => {
    const reported = partMap(record.diagnosis?.affectedParts);
    reported.forEach((label, key) => { if (!parts.has(key)) parts.set(key, label); });
    return reported;
  });
  return { page, pageCount, entries, parts: [...parts], reportedParts };
}
