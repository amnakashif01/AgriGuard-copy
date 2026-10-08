import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_REVIEW_VERSION, getReportAnalysisImage, getReportRequestedCrop, mergeVisualHighlights, needsHighlightReview } from '../src/lib/report-utils';

test('a completed one-pass report is eligible for detail review even with existing markers', () => {
    const report = { status: 'Complete' as const, disease: 'Leaf spot', severity: 'Medium' as const, imageThumb: 'data:image/jpeg;base64,test', visualHighlightsReviewed: true, visualHighlights: [{ boundingBox: [10, 10, 500, 500], reasoning: 'Visible damage' }] };
    assert.equal(needsHighlightReview(report), true, 'repair previously saved one-pass reports');
    assert.equal(needsHighlightReview({ ...report, visualHighlightsReviewVersion: HIGHLIGHT_REVIEW_VERSION }), false, 'do not repeat completed detail checks');
    assert.equal(needsHighlightReview({ ...report, disease: 'Healthy', severity: 'None' }), false);
    assert.equal(needsHighlightReview({ ...report, disease: 'صحت مند', severity: 'None' }), false);
    assert.equal(needsHighlightReview({ ...report, status: 'Processing' }), false);
});

test('detailed review keeps original evidence, tightens broad boxes and adds missed spots', () => {
    const initial = [{ boundingBox: [100, 100, 500, 500], reasoning: 'Broad cluster' }];
    const precise = { boundingBox: [200, 200, 250, 260], reasoning: 'Specific visible lesion' };
    const additional = { boundingBox: [600, 700, 650, 760], reasoning: 'Separate small lesion' };
    assert.deepEqual(mergeVisualHighlights(initial, [precise, additional]), [precise, additional]);
    assert.deepEqual(mergeVisualHighlights(initial, []), initial, 'an empty refinement must not erase existing evidence');
});


test('hybrid reports do not start another AI localization request on every page visit', () => {
    const report = { status: 'Complete' as const, disease: 'Common Rust', severity: 'Medium' as const,
        imageThumb: 'thumbnail', cropEvidence: { version: 2 } as any,
        visualHighlightsReviewVersion: 0, visualHighlightsReviewed: false };
    assert.equal(needsHighlightReview(report), false);
    assert.equal(needsHighlightReview({ ...report, visualHighlights: [] }), false, 'no repeated automatic request even when no lesion was confidently localized');
});

test('retry uses the saved inference image and user crop, never a previous wrong prediction', () => {
    const report = { analysisImage: 'original', imageUrl: 'display', imageThumb: 'thumbnail', crop: 'Tomato', requestedCrop: 'Maize' };
    assert.equal(getReportAnalysisImage(report), 'original');
    assert.equal(getReportRequestedCrop(report), 'Maize');
    assert.equal(getReportRequestedCrop({ ...report, requestedCrop: 'Unknown Crop' }), 'Unknown Crop');
    assert.equal(getReportRequestedCrop({ crop: 'Tomato' }), 'Unknown Crop', 'legacy predicted tomato cannot bias a retry of a maize photo');
    assert.equal(getReportRequestedCrop({ crop: 'Maize', cropId: 'crop', plantId: 'plant' }), 'Maize');
    assert.equal(getReportAnalysisImage({ imageUrl: 'url', imageThumb: 'thumbnail' }), 'url');
    assert.equal(getReportAnalysisImage({ imageThumb: 'thumbnail' }), 'thumbnail');
});
