import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DETECTOR_CLASSES, DETECTOR_REVISION, chooseDetectorEvidence, type DetectorResult} from '../src/lib/crop-detector';
import {resolveDetectorDiagnosis} from '../src/ai/detector-diagnosis';
import {detectCropLeaves} from '../src/ai/crop-detector-cpu';

const detection = (classId=9, score=91) => ({classId, score, label:DETECTOR_CLASSES[classId][0], box:[0,0,900,900] as [number,number,number,number]});
const result = (detections=[detection()]):DetectorResult => ({model:'YOLO11m PlantDoc',revision:DETECTOR_REVISION,status:'detected',elapsedMs:500,detections});
const input = {photoDataUri:'fixture',crop:'Maize',symptoms:'Brown marks'};
const report = {crop:'Maize',disease:'Fallback condition',confidence:72,affectedParts:['Leaves'],severity:'Medium' as const,severityScore:45,description:'Visible symptoms',visualHighlights:[],expertReviewRequired:true};

test('detector abstains on low scores, conflicts, wrong crops and unknown crops', async()=>{
  assert.equal(chooseDetectorEvidence(result([detection(9,27.4)]),'Maize').route,'gemini_fallback');
  assert.equal(chooseDetectorEvidence(result([detection(18,96)]),'Maize').route,'gemini_fallback');
  assert.equal(chooseDetectorEvidence(result([detection(9,96),detection(8,91)]),'Maize').route,'gemini_fallback');
  assert.equal(chooseDetectorEvidence(result([])).route,'gemini_fallback');
  assert.equal(chooseDetectorEvidence(result(),'corn (maize)').accepted?.disease,'Common Rust');
  for (const crop of ['Wheat','Mango','Rice','Cotton','Citrus']) {
    assert.equal((await detectCropLeaves('not-decoded',crop)).status,'unsupported');
  }
  assert.equal((await detectCropLeaves('invalid','Maize')).status,'unavailable');
});

test('accepted report keeps detector identity and score; support supplies severity and care', async()=>{
  const output=await resolveDetectorDiagnosis(input,{
    detect:async()=>result(),
    support:async()=>({...report,review:{applicable:true,agrees:true,reason:'Rust pustules visible.'}}),
    fallback:async()=>{throw new Error('Unexpected fallback');},
  });
  assert.equal(output.disease,'Common Rust');
  assert.equal(output.confidence,91);
  assert.equal(output.severityScore,45,'severity is independent of the detector score');
  assert.equal(output.cropEvidence?.route,'model_assisted');
});

test('even a 97% detector prediction is discarded when the image review rejects it', async()=>{
  for(const review of [{applicable:true,agrees:false,reason:'Different disease visible.'},{applicable:false,agrees:true,reason:'Fruit, not a leaf.'}]) {
    let calls=0;
    const output=await resolveDetectorDiagnosis(input,{
      detect:async()=>result([detection(9,97)]),
      support:async()=>({...report,review}),
      fallback:async()=>{calls++;return report;},
    });
    assert.equal(calls,1);
    assert.equal(output.disease,report.disease);
    assert.equal(output.confidence,72);
    assert.equal(output.cropEvidence?.route,'gemini_fallback');
    assert.equal(output.cropEvidence?.accepted,undefined);
  }
});

test('low-confidence and empty detections go directly to independent diagnosis without anchoring it', async()=>{
  for(const detections of [[detection(8,27.4)],[]]) {
    const output=await resolveDetectorDiagnosis(input,{
      detect:async()=>result(detections),
      support:async()=>{throw new Error('Uncertain candidate must not reach support prompt');},
      fallback:async()=>report,
    });
    assert.equal(output.disease,report.disease);
    assert.equal(output.cropEvidence?.route,'gemini_fallback');
  }
});
