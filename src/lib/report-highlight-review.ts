'use client';

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { getDb } from './firestore';
import type { DiagnosisReport } from './models';
import { HIGHLIGHT_REVIEW_VERSION, mergeVisualHighlights, needsHighlightReview, type VisualHighlight } from './report-utils';
import { localizeDiagnosisHighlights } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

// Save only the image annotations. A late response must never overwrite a newer
// diagnosis, recreate a deleted report, or modify treatment/severity/history.
export async function saveReviewedHighlights(uid: string, original: DiagnosisReport, localized: VisualHighlight[], db: Firestore = getDb()): Promise<DiagnosisReport | null> {
    const ref = doc(db, 'users', uid, 'reports', original.id);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return null;
        const current = { ...snapshot.data(), id: original.id } as DiagnosisReport;
        if (current.status !== 'Complete' || current.disease !== original.disease
            || current.description !== original.description
            || current.updatedAt !== original.updatedAt
            || (current.imageUrl || current.imageThumb) !== (original.imageUrl || original.imageThumb)) return null;
        if (!needsHighlightReview(current)) return current;
        const patch = {
            visualHighlights: mergeVisualHighlights(current.visualHighlights || [], localized),
            visualHighlightsReviewed: true,
            visualHighlightsReviewVersion: HIGHLIGHT_REVIEW_VERSION,
        };
        transaction.update(ref, patch);
        return { ...current, ...patch };
    });
}

const inFlight = new Map<string, Promise<DiagnosisReport | null>>();

// Shared by full report and comparison views; React remounts do not start
// duplicate image requests. Diagnosis and treatment remain visible throughout.
export function reviewReportHighlights(uid: string, report: DiagnosisReport): Promise<DiagnosisReport | null> {
    const key = JSON.stringify([uid, report.id, report.updatedAt, report.disease, report.description]);
    const running = inFlight.get(key);
    if (running) return running;
    const task = (async () => {
        const src = (report.imageUrl || report.imageThumb) as string;
        let photoDataUri = src;
        if (!src.startsWith('data:')) {
            const response = await fetch(src);
            if (!response.ok) throw new Error('Unable to load the report image.');
            const blob = await response.blob();
            photoDataUri = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        const localized = await localizeDiagnosisHighlights({
            photoDataUri, crop: report.crop || 'Unknown Crop',
            disease: report.disease || 'Unknown Disease', description: report.description || '',
        });
        return saveReviewedHighlights(uid, report, localized);
    })().finally(() => { inFlight.delete(key); });
    inFlight.set(key, task);
    return task;
}
