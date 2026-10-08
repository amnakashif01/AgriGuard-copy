import type { PlantRecord } from './models';
import { comparePlantRecords, completedPlantRecords, partMap } from './record-comparison';

/** All completed captures remain visible; completion/retry time never reorders them. */
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
