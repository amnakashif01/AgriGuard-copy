'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, ScanLine, X } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type MyCrop, type MyPlant, cleanName } from '@/lib/my-crops/models';
import { plantNameExists, startPlantRecord } from '@/lib/my-crops/repository';
import { preparePlantPhoto } from '@/lib/my-crops/images';
import { analyzeSavedPlantRecord } from '@/lib/my-crops/analyze-record';
import { CropFrame, ErrorNotice, greenButton, LoadState, useCropData } from './shared';

export function RecordForm({ cropId, plantId }: { cropId: string; plantId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { i18n } = useTranslation();
  const cropState = useCropData<MyCrop>(`crops/${cropId}`);
  const plantState = useCropData<MyPlant>(plantId ? `crops/${cropId}/plants/${plantId}` : null);
  const crop = cropState.data[0];
  const plant = plantId ? plantState.data[0] : undefined;
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [stage, setStage] = useState('');
  const [saved, setSaved] = useState<{ plantId: string; reportId: string } | null>(null);
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (plant?.age) setAge(plant.age); }, [plant?.age]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    setDuplicate(false);
    if (plantId || !user || !cleanName(name)) return;
    let current = true;
    const timer = setTimeout(() => { plantNameExists(user.uid, cropId, name).then(exists => { if (current) setDuplicate(exists); }).catch(() => {}); }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [name, user, cropId, plantId]);
  const backHref = plantId ? `/my-crops/${cropId}/${plantId}` : `/my-crops/${cropId}`;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || busy.current || duplicate) return;
    busy.current = true; setError('');
    let target = saved;
    try {
      if (!target) {
        if (!file) throw new Error('Please add a plant photo before analyzing.');
        setStage('Preparing your photo…');
        const images = await preparePlantPhoto(file);
        setStage('Saving your plant record…');
        target = await startPlantRecord(user.uid, cropId, { plantId, name, age, symptoms, ...images });
        setSaved(target);
      }
      setStage('Analyzing your plant…');
      await analyzeSavedPlantRecord(user.uid, cropId, target.plantId, target.reportId, i18n.language === 'urdu' ? 'urdu' : 'english');
      router.push(`/my-crops/${cropId}/${target.plantId}`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not analyze your plant. Please try again.'); }
    finally { busy.current = false; setStage(''); }
  }
  const loading = cropState.loading || (Boolean(plantId) && plantState.loading);
  const loadError = cropState.error || (plantId ? plantState.error : '');
  const missing = !loading && (!crop || (Boolean(plantId) && !plant));
  return <CropFrame title={plantId ? 'Add new record' : 'Add your plant'} eyebrow={crop?.name.toUpperCase() || 'MY CROPS'} subtitle={plant ? `${plant.name} · ${plant.code}` : 'Name your plant and start its health story.'} back={{ href: backHref, label: plant?.name || crop?.name || 'Back to crop' }}>
    <LoadState loading={loading} error={loadError} missing={missing} />
    {!loading && !loadError && !missing && <form onSubmit={submit} className="space-y-6 rounded-3xl border border-emerald-100 bg-white p-5 sm:p-7">
      <fieldset disabled={Boolean(stage) || Boolean(saved)} className="space-y-6">
        {!plantId && <div className="space-y-2"><Label htmlFor="plant-name" className="text-base">Plant name</Label><Input id="plant-name" value={name} onChange={event => setName(event.target.value)} maxLength={64} required placeholder="Give your plant a name" autoComplete="off" aria-invalid={duplicate} aria-describedby="plant-name-help" className="h-12 rounded-xl" /><p id="plant-name-help" className={`text-xs ${duplicate ? 'text-red-700' : 'text-slate-500'}`}>{duplicate ? 'This plant name is already in use. Please choose another name.' : `Choose a unique name within ${crop?.name}.`}</p></div>}
        <div className="space-y-3"><Label htmlFor="plant-photo" className="text-base">Plant photo</Label><input ref={fileInput} id="plant-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const next = event.target.files?.[0]; if (!next) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 10 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP photo smaller than 10 MB.'); event.target.value = ''; return; } setFile(next); setError(''); }} />
          {preview ? <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50"><img src={preview} alt="Selected plant for analysis" className="max-h-72 w-full object-contain" /><button type="button" aria-label="Remove plant photo" className="absolute right-3 top-3 rounded-full bg-white p-2 shadow" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}><X className="h-4 w-4" /></button></div> : <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-5 text-emerald-800 hover:border-emerald-500"><Camera className="h-9 w-9" /><span className="font-medium">Add plant photo</span><span className="text-xs text-slate-500">Take a photo or choose from your device</span></button>}
          <p className="text-xs text-slate-500">JPG, PNG or WebP · up to 10 MB. Use a clear, close photo of the affected area.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="plant-age" className="text-base">Plant age</Label><Input id="plant-age" value={age} onChange={event => setAge(event.target.value)} required maxLength={80} placeholder="For example, 5 months or 20 days" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label htmlFor="plant-symptoms" className="text-base">Symptoms <span className="text-sm font-normal text-slate-400">(optional)</span></Label><Textarea id="plant-symptoms" value={symptoms} onChange={event => setSymptoms(event.target.value)} maxLength={2000} rows={4} placeholder="Describe any spots, yellowing, wilting or other changes…" className="rounded-xl" /></div>
      </fieldset>
      {error && <ErrorNotice message={error} />}
      {saved && error && <p className="text-sm text-slate-600">Your record is saved. Retry its analysis or return to the timeline; you do not need to add this plant again.</p>}
      <Button type="submit" disabled={Boolean(stage) || duplicate} className={`w-full ${greenButton}`}>{stage ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ScanLine className="mr-2 h-5 w-5" />}{stage || (saved ? 'Retry analysis' : 'Analyze')}</Button>
      {stage && <p role="status" aria-live="polite" className="text-center text-xs leading-5 text-slate-500">{stage} Keep this page open while the result is saved.</p>}
      {saved && !stage && <Button asChild variant="outline" className="w-full rounded-xl"><Link href={`/my-crops/${cropId}/${saved.plantId}`}>View saved timeline</Link></Button>}
    </form>}
  </CropFrame>;
}
