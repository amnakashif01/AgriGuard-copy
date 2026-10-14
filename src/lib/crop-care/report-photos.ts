import type { CareReport } from "./models";

const DAMAGE_RANK: Record<string, number> = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
};

/** Compare saved damage levels only within the same crop and season. */
export function cropDamageChange(previous: CareReport, current: CareReport) {
  if (
    !earlierCareReports([previous], current).length ||
    !Object.hasOwn(DAMAGE_RANK, previous.severity) ||
    !Object.hasOwn(DAMAGE_RANK, current.severity)
  )
    return null;
  const difference =
    DAMAGE_RANK[current.severity] - DAMAGE_RANK[previous.severity];
  return difference > 0
    ? { direction: "higher" as const, message: "Damage is higher than before." }
    : difference < 0
      ? { direction: "lower" as const, message: "Damage is lower than before." }
      : { direction: "same" as const, message: "Damage level is the same." };
}

/** A comparison belongs to one explicit planting and one plant/field. */
export function earlierCareReports(
  reports: CareReport[],
  current: CareReport,
): CareReport[] {
  const currentTime = Date.parse(current.createdAt);
  if (
    !current.careSeasonId ||
    !current.cropId ||
    current.status !== "Complete" ||
    !Number.isFinite(currentTime)
  )
    return [];
  return reports
    .filter(
      (r) =>
        r.id !== current.id &&
        r.status === "Complete" &&
        r.careSeasonId === current.careSeasonId &&
        r.cropId === current.cropId &&
        r.plantId === current.plantId &&
        r.fieldId === current.fieldId &&
        Number.isFinite(Date.parse(r.createdAt)) &&
        Date.parse(r.createdAt) < currentTime,
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
}

/** Preserve the complete saved raster; slicing a data URI corrupts the photo. */
export function savedCarePhoto(...values: unknown[]): string {
  return (
    values.find(
      (value): value is string =>
        typeof value === "string" &&
        value.length <= 750000 &&
        /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value),
    ) || ""
  );
}
