import type { CareReport } from "./models";

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
