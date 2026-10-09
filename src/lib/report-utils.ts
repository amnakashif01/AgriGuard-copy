import type { DiagnosisReport } from './models';

export type VisualHighlight = { boundingBox: number[]; reasoning: string };

// Version the dedicated image review separately from the main diagnosis. Older
// one-pass reports incorrectly used visualHighlightsReviewed=true as completion.
export const HIGHLIGHT_REVIEW_VERSION = 1;
export function needsHighlightReview(report: Partial<DiagnosisReport>): boolean {
    // Hybrid reports already localize symptoms in the initial image request.
    // Opening a saved report must not trigger another billable/fallible AI call.
    return report.status === 'Complete'
        && ![2, 3].includes(report.cropEvidence?.version || 0)
        && report.visualHighlightsReviewVersion !== HIGHLIGHT_REVIEW_VERSION
        && report.severity !== 'None'
        && !/healthy|not a crop|not a plant/i.test(report.disease || '')
        && Boolean(report.imageUrl || report.imageThumb);
}

export function getReportAnalysisImage(report: Partial<DiagnosisReport>): string | undefined {
    return report.analysisImage || report.imageUrl || report.imageThumb;
}

export function getReportRequestedCrop(report: Partial<DiagnosisReport>): string {
    // A previous prediction is not user evidence. Legacy reports keep auto-detect.
    return report.requestedCrop || (isTrackedPlantReport(report) ? report.crop : undefined) || 'Unknown Crop';
}

export function mergeVisualHighlights(primary: VisualHighlight[], localized: VisualHighlight[]): VisualHighlight[] {
    const merged = [...primary];
    for (const candidate of localized) {
        const [top, left, bottom, right] = candidate.boundingBox;
        const candidateArea = Math.max(0, bottom - top) * Math.max(0, right - left);
        if (!candidateArea) continue;

        const overlapIndex = merged.findIndex(existing => {
            const [existingTop, existingLeft, existingBottom, existingRight] = existing.boundingBox;
            const overlapWidth = Math.max(0, Math.min(right, existingRight) - Math.max(left, existingLeft));
            const overlapHeight = Math.max(0, Math.min(bottom, existingBottom) - Math.max(top, existingTop));
            const existingArea = Math.max(0, existingBottom - existingTop) * Math.max(0, existingRight - existingLeft);
            return overlapWidth * overlapHeight / Math.max(1, Math.min(candidateArea, existingArea)) >= 0.6;
        });

        if (overlapIndex < 0) {
            if (merged.length < 40) merged.push(candidate);
            continue;
        }

        const [existingTop, existingLeft, existingBottom, existingRight] = merged[overlapIndex].boundingBox;
        const existingArea = (existingBottom - existingTop) * (existingRight - existingLeft);
        if (candidateArea < existingArea) merged[overlapIndex] = candidate;
    }
    return merged;
}

export function timestampToMillis(value: any): number {
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const millis = typeof value === 'number' ? value : new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
}

function normalizeLabel(value?: string): string {
    return value?.trim().toLocaleLowerCase() || '';
}

export function isPlanEligible(report: Partial<DiagnosisReport>): boolean {
    const crop = normalizeLabel(report.crop);
    const disease = normalizeLabel(report.disease);
    const invalidCrop = !crop || /unknown|unidentified|crop to be identified|not a crop|not a plant/.test(crop);
    const invalidDisease = !disease || /healthy|unknown|unidentified|not a crop|not a plant/.test(disease);

    return report.status === 'Complete'
        && Boolean(report.imageUrl || report.imageThumb)
        && !invalidCrop
        && !invalidDisease;
}

/** Only named plants in My Crops have a comparison history. */
export function isTrackedPlantReport(report: Partial<DiagnosisReport> | null | undefined): boolean {
    return Boolean(report?.cropId?.trim() && report?.plantId?.trim());
}

export function findPreviousReport(
    reports: DiagnosisReport[],
    current: DiagnosisReport
): DiagnosisReport | null {
    const currentTime = timestampToMillis(current.createdAt);
    const currentCrop = normalizeLabel(current.crop);
    if (!currentTime || !currentCrop) return null;

    return reports
        .filter(candidate => candidate.id !== current.id
            && candidate.status === 'Complete'
            && candidate.fieldId === current.fieldId
            && candidate.plantId === current.plantId
            && candidate.cropId === current.cropId
            && normalizeLabel(candidate.crop) === currentCrop
            && timestampToMillis(candidate.createdAt) < currentTime)
        .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt))[0] || null;
}

/** Standalone diagnosis pages must never look up another report for comparison. */
export function findTrackedPreviousReport(reports: DiagnosisReport[], current: DiagnosisReport): DiagnosisReport | null {
    return isTrackedPlantReport(current) ? findPreviousReport(reports, current) : null;
}
