import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import CropModelEvidence from '../src/components/agrisahayak/crop-model-evidence';
import ReportModelBadge from '../src/components/agrisahayak/report-model-badge';
import {chooseDetectorEvidence, DETECTOR_REVISION, rejectDetectorEvidence} from '../src/lib/crop-detector';

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
  assert.doesNotMatch(html, /Diagnosis model|90.19%|Detector score/);
  const badge = renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:fallback}}/>);
  assert.match(badge, /Gemini fallback/);
  assert.doesNotMatch(badge, /YOLO11m \+ Gemini/);
});

test('dashboard attribution does not invent sources for legacy or unfinished reports', () => {
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete'}}/>), '');
  assert.equal(renderToStaticMarkup(<ReportModelBadge report={{status:'Pending',cropEvidence:evidence}}/>), '');
  const missingAcceptance = {...evidence,accepted:undefined};
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:missingAcceptance}}/>), /Gemini fallback/);
});
