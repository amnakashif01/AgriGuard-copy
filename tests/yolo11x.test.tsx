import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CURRENT_DETECTOR_CLASSES as labels, CURRENT_DETECTOR_MODEL, CURRENT_DETECTOR_REVISION, CropEvidenceSchema, chooseDetectorEvidence, detectorSupportsCrop, type DetectorResult} from '../src/lib/crop-detector';
import CropModelEvidence from '../src/components/agrisahayak/crop-model-evidence';
import ReportModelBadge from '../src/components/agrisahayak/report-model-badge';
const detection=(id:number,score=95)=>({classId:id,label:labels[id][0],score,box:[0,0,900,900] as [number,number,number,number]});
const result=(ids=[0]):DetectorResult=>({model:CURRENT_DETECTOR_MODEL,revision:CURRENT_DETECTOR_REVISION,status:'detected',elapsedMs:2000,detections:ids.map(id=>detection(id))});

test('new checkpoint retains its exact label order, revision and model attribution',()=>{
  assert.equal(labels.length,116);
  const evidence=chooseDetectorEvidence(result(),'Corn');
  assert.equal(evidence.accepted?.crop,'Maize');
  assert.equal(evidence.accepted?.disease,'Common Rust');
  assert.equal(evidence.accepted?.model,CURRENT_DETECTOR_MODEL);
  assert.equal(CropEvidenceSchema.safeParse(evidence).success,true);
  const html=renderToStaticMarkup(<CropModelEvidence evidence={evidence}/>);
  assert.match(html,/YOLO11x analysis/);assert.doesNotMatch(html,/YOLO11m/);
  assert.match(renderToStaticMarkup(<ReportModelBadge report={{status:'Complete',cropEvidence:evidence}}/>),/YOLO11x \+ Gemini/);
  assert.equal(CropEvidenceSchema.safeParse({...evidence,detector:{...evidence.detector,revision:'wrong'}}).success,false);
});

test('duplicate dataset classes may agree but conflicting crops and conditions are rejected',()=>{
  const duplicate=labels.findIndex(x=>x[0]==='Corn rust leaf');
  assert.equal(chooseDetectorEvidence(result([0,duplicate]),'Maize').route,'model_assisted');
  assert.equal(chooseDetectorEvidence(result([0,4]),'Maize').route,'gemini_fallback');
  assert.equal(chooseDetectorEvidence(result(),'Tomato').route,'gemini_fallback');
  const mislabeled=result();mislabeled.detections[0].label='tomato late blight';
  assert.equal(chooseDetectorEvidence(mislabeled).route,'gemini_fallback');
  const weak=result();weak.detections[0].score=79.9;
  assert.equal(chooseDetectorEvidence(weak).route,'gemini_fallback');
});

test('general symptom categories never become a definitive model diagnosis',()=>{
  for(const label of ['Corn Yellowing','Corn Insects Damages','Tomato Brown Spots','Tomato blight leaf']){
    const id=labels.findIndex(x=>x[0]===label);assert.ok(id>=0);
    assert.equal(chooseDetectorEvidence(result([id])).route,'gemini_fallback');
  }
  assert.equal(detectorSupportsCrop('Rice'),true);
  assert.equal(detectorSupportsCrop('Citrus'),true);
  assert.equal(detectorSupportsCrop('Wheat'),false);
  assert.equal(detectorSupportsCrop('Mango'),false);
});
