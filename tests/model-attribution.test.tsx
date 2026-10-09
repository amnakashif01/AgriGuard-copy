import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import CropModelEvidence from '../src/components/agrisahayak/crop-model-evidence';
import ReportModelBadge from '../src/components/agrisahayak/report-model-badge';
import {chooseDetectorEvidence, chooseClassifierEvidence, DETECTOR_REVISION, rejectDetectorEvidence} from '../src/lib/crop-detector';
import {CLASSIFIER_REVISION} from '../src/lib/crop-classifier';

const evidence = chooseDetectorEvidence({model:'YOLO11m PlantDoc',revision:DETECTOR_REVISION,status:'detected',elapsedMs:900,detections:[{classId:9,label:'Corn rust leaf',score:90.19,box:[100,100,800,800]}]}, 'Maize');

test('accepted detector report shows its score and does not claim DaViT ran', () => {
  const html = renderToStaticMarkup(<CropModelEvidence evidence={evidence}/>);
  assert.match(html, /Model Analysis/);
  assert.match(html, /YOLO11m analysis/);
  assert.match(html, /DaViT analysis/);
  assert.match(html, /Analysis completed/);
  assert.match(html, /Not run for this report/);
  assert.match(html, /90.19/);
  assert.match(html, /AI image review &amp; care plan · Gemini/);
  assert.match(html, /Model score is not measured accuracy/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:evidence}}/>), /YOLO11m \+ Gemini/);
});

test('rejected candidates keep a completed check but never appear as accepted scores', () => {
  const fallback = rejectDetectorEvidence(evidence, 'The image shows an unsupported fruit condition.');
  const html = renderToStaticMarkup(<CropModelEvidence evidence={fallback}/>);
  assert.match(html, /Analysis completed/);
  assert.match(html, /Image assessment and care guidance provided by Gemini/);
  assert.doesNotMatch(html, /90\.19|Model score|Gemini fallback|Further review needed/);
  assert.match(html, /No result from this model was recorded/);
  const badge = renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:fallback}}/>);
  assert.match(badge, /Crop analysis complete/);
  assert.doesNotMatch(badge, /Gemini fallback|YOLO11m \+ Gemini/);
});

test('both completed checks remain visible without exposing rejected classifier scores', () => {
  const fallback = chooseClassifierEvidence(evidence, {model:'DaViT-Base',revision:CLASSIFIER_REVISION,status:'classified',elapsedMs:450,
    prediction:{crop:{label:'tomato',score:67.25},category:{label:'disease',score:66.15},condition:{label:'blossom end rot',score:82.82},cropMasked:true}});
  const html = renderToStaticMarkup(<CropModelEvidence evidence={fallback}/>);
  assert.equal((html.match(/Analysis completed/g) || []).length, 2);
  assert.match(html, /Image assessment and care guidance provided by Gemini/);
  assert.doesNotMatch(html, /67\.25|66\.15|82\.82|blossom end rot|Model score|Gemini fallback|Further review needed/);
  // Presentation changes must not discard diagnostic evidence used for backend decisions.
  assert.equal(fallback.classifier?.prediction?.crop.score, 67.25);
  assert.equal(fallback.route, 'gemini_fallback');
});

test('dashboard attribution does not invent sources for legacy or unfinished reports', () => {
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete'}}/>), '');
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Pending',cropEvidence:evidence}}/>), '');
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:{...evidence,accepted:undefined}}}/>), /Crop analysis complete/);
});

test('accepted DaViT score is shown only in its own card, without rejected YOLO scores or leaf boxes', () => {
  const classified = chooseClassifierEvidence(evidence, {model:'DaViT-Base',revision:CLASSIFIER_REVISION,status:'classified',elapsedMs:450,
    prediction:{crop:{label:'maize',score:90.5},category:{label:'pest/weed',score:92.4},condition:{label:'fall armyworm',score:90.6},cropMasked:false}}, 'Maize');
  const html = renderToStaticMarkup(<CropModelEvidence evidence={classified} imageUrl="fixture.jpg"/>);
  assert.match(html, /DaViT-Base/);
  assert.match(html, /Model score/);
  assert.match(html, /90.50/);
  const yoloCard = html.split('aria-label="YOLO11m analysis"')[1].split('</section>')[0];
  const davitCard = html.split('aria-label="DaViT analysis"')[1].split('</section>')[0];
  assert.doesNotMatch(yoloCard, /Model score|90\.19/);
  assert.match(davitCard, /90\.50/);
  assert.doesNotMatch(html, /href="https:\/\/github|Model source|model-detected leaf regions/);
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:classified}}/>), /DaViT \+ Gemini/);
});

test('unavailable and skipped models never receive an analysis-completed status', () => {
  for (const status of ['unsupported', 'unavailable'] as const) {
    const skipped = chooseDetectorEvidence({...evidence.detector,status,detections:[]});
    const result = chooseClassifierEvidence(skipped, {model:'DaViT-Base',revision:CLASSIFIER_REVISION,status:'unavailable',elapsedMs:0});
    const html = renderToStaticMarkup(<CropModelEvidence evidence={result}/>);
    assert.doesNotMatch(html, /Analysis completed|Model score/);
    assert.match(html, /Not available for this report/);
    if (status === 'unsupported') assert.match(html, /Not applicable to this crop/);
  }
});
