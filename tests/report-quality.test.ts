import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_REVIEW_VERSION, mergeVisualHighlights, needsHighlightReview } from '../src/lib/report-utils';

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
