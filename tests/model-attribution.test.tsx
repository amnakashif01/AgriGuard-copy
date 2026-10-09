import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import CropModelEvidence from '../src/components/agrisahayak/crop-model-evidence';
import ReportModelBadge from '../src/components/agrisahayak/report-model-badge';
import {chooseDetectorEvidence, DETECTOR_REVISION, rejectDetectorEvidence} from '../src/lib/crop-detector';
import { chooseClassifierEvidence } from '../src/lib/crop-detector';
import { CLASSIFIER_REVISION } from '../src/lib/crop-classifier';

const evidence = chooseDetectorEvidence({model:'YOLO11m PlantDoc',revision:DETECTOR_REVISION,status:'detected',elapsedMs:900,detections:[{classId:9,label:'Corn rust leaf',score:90.19,box:[100,100,800,800]}]}, 'Maize');

test('accepted detector report clearly separates diagnosis from Gemini supporting roles', () => {
  const html = renderToStaticMarkup(<CropModelEvidence evidence={evidence}/>);
  assert.match(html, /Model used for this diagnosis/);
  assert.match(html, /YOLO11m · PlantDoc/);
  assert.match(html, /Diagnosis model/);
  assert.match(html, /90.19/);
  assert.match(html, /Image review, estimated severity/);
  assert.match(html, /Detector score is not measured accuracy/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:evidence}}/>), /YOLO11m \+ Gemini/);
});

test('a rejected detector candidate is never presented as the diagnosis model or score', () => {
  const fallback = rejectDetectorEvidence(evidence, 'The image shows an unsupported fruit condition.');
  const html = renderToStaticMarkup(<CropModelEvidence evidence={fallback}/>);
  assert.match(html, /Gemini fallback/);
  assert.match(html, /Provided the image assessment and care report/);
  assert.doesNotMatch(html, /Diagnosis model|Detector score/);
  assert.match(html, /Best leaf candidate: Corn rust leaf \(90\.19% raw score\)/);
  assert.match(html, /No DaViT result was recorded/);
  const badge = renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:fallback}}/>);
  assert.match(badge, /Gemini fallback/);
  assert.doesNotMatch(badge, /YOLO11m \+ Gemini/);
});

test('fallback exposes recorded raw scores without relabelling them as a confirmed diagnosis', () => {
  const fallback = chooseClassifierEvidence(evidence, { model: 'DaViT-Base', revision: CLASSIFIER_REVISION, status: 'classified', elapsedMs: 450,
    prediction: { crop: { label: 'tomato', score: 67.25 }, category: { label: 'disease', score: 66.15 }, condition: { label: 'blossom end rot', score: 82.82 }, cropMasked: true } });
  const html = renderToStaticMarkup(<CropModelEvidence evidence={fallback}/>);
  assert.match(html, /crop identification \(67\.25%\)/);
  assert.match(html, /category \(66\.15%\)/);
  assert.match(html, /Condition candidate/);
  assert.match(html, /blossom end rot/);
  assert.match(html, /raw model candidates, not additional confirmed diagnoses/);
  assert.match(html, /Gemini fallback/);
  assert.doesNotMatch(html, /Diagnosis model/);
});

test('dashboard attribution does not invent sources for legacy or unfinished reports', () => {
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete'}}/>), '');
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Pending',cropEvidence:evidence}}/>), '');
  const missingAcceptance = {...evidence,accepted:undefined};
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:missingAcceptance}}/>), /Gemini fallback/);
});

test('DaViT attribution is truthful and does not expose upstream source links or leaf boxes', () => {
  const classified = chooseClassifierEvidence(evidence, { model: 'DaViT-Base', revision: CLASSIFIER_REVISION, status: 'classified', elapsedMs: 450,
    prediction: { crop: { label: 'maize', score: 90.5 }, category: { label: 'pest/weed', score: 92.4 }, condition: { label: 'fall armyworm', score: 90.6 }, cropMasked: false } }, 'Maize');
  const html = renderToStaticMarkup(<CropModelEvidence evidence={classified} imageUrl="fixture.jpg" />);
  assert.match(html, /DaViT-Base/); assert.match(html, /Model score/); assert.match(html, /90.50/);
  assert.doesNotMatch(html, /href="https:\/\/github|Model source|model-detected leaf regions/);
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:classified}}/>), /DaViT \+ Gemini/);
});
