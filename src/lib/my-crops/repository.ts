import { collection, doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore';
import { getDb } from '../firestore';
import type { InstantDiagnosisFromImageAndSymptomsOutput } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';
import { cleanName, nameId, nameKey, plantCode, validateName, type MyCrop, type MyPlant, type PlantRecord } from './models';

export async function addCrop(uid: string, rawName: string, db: Firestore = getDb()): Promise<string> {
  const name = validateName(rawName, 'crop');
  const id = await nameId(name);
  const ref = doc(db, 'users', uid, 'crops', id);
  await runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) throw new Error('This crop is already in My Crops. Open its card to add a plant.');
    const now = new Date().toISOString();
    transaction.set(ref, { name, nameKey: nameKey(name), plantCount: 0, nextPlantNumber: 1, createdAt: now, updatedAt: now });
  });
  return id;
}

export async function plantNameExists(uid: string, cropId: string, name: string): Promise<boolean> {
  if (!cleanName(name)) return false;
  return (await getDoc(doc(getDb(), 'users', uid, 'crops', cropId, 'plants', await nameId(name)))).exists();
}

export type StartRecordInput = {
  plantId?: string; name?: string; age: string; symptoms: string; imageThumb: string; analysisImage: string;
};

export async function startPlantRecord(uid: string, cropId: string, input: StartRecordInput, db: Firestore = getDb()) {
  const name = input.plantId ? '' : validateName(input.name || '', 'plant');
  const age = cleanName(input.age);
  if (!age || age.length > 80) throw new Error('Enter the plant age, for example 5 months.');
  if (input.symptoms.length > 2000) throw new Error('Keep symptoms within 2,000 characters.');
  if (!input.imageThumb.startsWith('data:image/') || input.imageThumb.length > 120000 || !input.analysisImage.startsWith('data:image/') || input.analysisImage.length > 450000) {
    throw new Error('Please choose a smaller, valid plant photo.');
  }
  const plantId = input.plantId || await nameId(name);
  const cropRef = doc(db, 'users', uid, 'crops', cropId);
  const plantRef = doc(cropRef, 'plants', plantId);
  const reportRef = doc(collection(db, 'users', uid, 'reports'));
  const recordRef = doc(plantRef, 'records', reportRef.id);
  await runTransaction(db, async transaction => {
    const [cropSnapshot, plantSnapshot] = await Promise.all([transaction.get(cropRef), transaction.get(plantRef)]);
    if (!cropSnapshot.exists()) throw new Error('This crop no longer exists. Return to My Crops.');
    if (!input.plantId && plantSnapshot.exists()) throw new Error('This plant name is already in use. Please choose another name.');
    if (input.plantId && !plantSnapshot.exists()) throw new Error('This plant no longer exists. Return to your crop.');
    const crop = cropSnapshot.data() as MyCrop;
    const plant = plantSnapshot.data() as MyPlant | undefined;
    const now = new Date().toISOString();
    const plantName = plant?.name || name;
    const record: Omit<PlantRecord, 'id'> = {
      cropId, plantId, reportId: reportRef.id, cropName: crop.name, age, symptoms: input.symptoms.trim(),
      imageThumb: input.imageThumb, status: 'Processing', severityScore: null, createdAt: now,
    };
    transaction.set(recordRef, record);
    transaction.set(reportRef, {
      uid, crop: crop.name, cropId, plantId, plantName, plantRecordId: reportRef.id,
      imageThumb: input.analysisImage, symptoms: input.symptoms.trim(), age,
      disease: 'Analysis in progress', confidence: 0, affectedParts: [], severity: 'None', description: '',
      status: 'Processing', createdAt: now, updatedAt: now,
    });
    if (plant) {
      transaction.update(plantRef, { age, recordCount: plant.recordCount + 1, latestRecordId: reportRef.id, updatedAt: now });
    } else {
      transaction.set(plantRef, {
        cropId, name: plantName, nameKey: nameKey(plantName), code: plantCode(crop.name, crop.nextPlantNumber),
        age, imageThumb: input.imageThumb, recordCount: 1, latestRecordId: reportRef.id,
        latestSeverityScore: null, createdAt: now, updatedAt: now,
      });
    }
    transaction.update(cropRef, {
      updatedAt: now,
      ...(!plant ? { plantCount: crop.plantCount + 1, nextPlantNumber: crop.nextPlantNumber + 1 } : {}),
    });
  });
  return { plantId, reportId: reportRef.id };
}

export type RecordAnalysis = { diagnosis: InstantDiagnosisFromImageAndSymptomsOutput; severityScore: number | null; severityExplanation: string };

export async function finishPlantRecord(uid: string, cropId: string, plantId: string, reportId: string, analysis: RecordAnalysis, db: Firestore = getDb()) {
  if (analysis.severityScore !== null && (!Number.isInteger(analysis.severityScore) || analysis.severityScore < 0 || analysis.severityScore > 100)) throw new Error('Invalid severity result. Please retry analysis.');
  const cropRef = doc(db, 'users', uid, 'crops', cropId);
  const plantRef = doc(cropRef, 'plants', plantId);
  const recordRef = doc(plantRef, 'records', reportId);
  const reportRef = doc(db, 'users', uid, 'reports', reportId);
  await runTransaction(db, async transaction => {
    const [record, plant] = await Promise.all([transaction.get(recordRef), transaction.get(plantRef)]);
    if (!record.exists() || !plant.exists()) throw new Error('The saved plant record could not be found.');
    if (record.data().status === 'Complete') return; // Completed history is immutable through this flow.
    const now = new Date().toISOString();
    const cleanAnalysis = JSON.parse(JSON.stringify(analysis));
    transaction.update(recordRef, { ...cleanAnalysis, status: 'Complete', error: '', completedAt: now });
    transaction.update(reportRef, { ...cleanAnalysis.diagnosis, severityScore: analysis.severityScore, severityExplanation: analysis.severityExplanation, status: 'Complete', updatedAt: now });
    if (plant.data().latestRecordId === reportId) {
      transaction.update(plantRef, { latestSeverityScore: analysis.severityScore, latestDisease: analysis.diagnosis.disease, updatedAt: now });
    }
    transaction.update(cropRef, { updatedAt: now });
  });
}

export async function failPlantRecord(uid: string, cropId: string, plantId: string, reportId: string, error: string) {
  const db = getDb();
  const ref = doc(db, 'users', uid, 'crops', cropId, 'plants', plantId, 'records', reportId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().status === 'Complete') return;
    transaction.update(ref, { status: 'Error', error });
    transaction.update(doc(db, 'users', uid, 'reports', reportId), { status: 'Error', updatedAt: new Date().toISOString() });
  });
}
