'use client';

import { doc, getDoc } from 'firebase/firestore';
import { getApp, getDb } from '../firestore';
import { getAuth } from 'firebase/auth';
import { analyzeTrackedPlant } from '../actions/plant-analysis-actions';
import { finishPlantRecord, failPlantRecord } from './repository';
import { sendDiagnosisComplete } from '../notifications';
import { createLog } from '../repositories';
import type { PlantRecord } from './models';

export async function analyzeSavedPlantRecord(uid: string, cropId: string, plantId: string, reportId: string, language: 'english' | 'urdu') {
  const db = getDb();
  const startedAt = Date.now();
  try {
    const [recordSnapshot, reportSnapshot] = await Promise.all([
      getDoc(doc(db, 'users', uid, 'crops', cropId, 'plants', plantId, 'records', reportId)),
      getDoc(doc(db, 'users', uid, 'reports', reportId)),
    ]);
    if (!recordSnapshot.exists() || !reportSnapshot.exists()) throw new Error('The saved record could not be found.');
    const record = recordSnapshot.data() as PlantRecord;
    if (record.status === 'Complete') return;
    const currentUser = getAuth(getApp()).currentUser;
    if (!currentUser || currentUser.uid !== uid) throw new Error('Please sign in again to analyze this plant.');
    const idToken = await currentUser.getIdToken();
    const result = await analyzeTrackedPlant({
      photoDataUri: reportSnapshot.data().imageThumb, crop: record.cropName,
      age: record.age, symptoms: record.symptoms, language,
    }, idToken);
    if (!result.ok) throw new Error(result.error);
    await finishPlantRecord(uid, cropId, plantId, reportId, result.analysis);
    const diagnosis = result.analysis.diagnosis;
    void sendDiagnosisComplete(uid, reportId, diagnosis.crop, diagnosis.disease, diagnosis.severity, diagnosis.confidence).catch(console.warn);
    void createLog({ agentName: 'diagnosticAgent', action: 'diagnosis_completed', reportId, status: 'success', duration: Date.now() - startedAt, payload: { confidence: diagnosis.confidence, cropId, plantId } });
    window.dispatchEvent(new Event('reportCreated'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not analyze the plant. Please retry.';
    await failPlantRecord(uid, cropId, plantId, reportId, message).catch(console.warn);
    throw new Error(message);
  }
}
