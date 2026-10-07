'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Plus, Sprout, Wheat } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CROP_OPTIONS, type MyCrop } from '@/lib/my-crops/models';
import { addCrop } from '@/lib/my-crops/repository';
import { CropFrame, ErrorNotice, greenButton, LoadState, updatedLabel, useCropData } from './shared';

export function CropsPage() {
  const { user } = useAuth();
  const crops = useCropData<MyCrop>('crops', true, 'updatedAt', 'desc');
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || saving) return;
    setError(''); setSaving(true);
    try {
      await addCrop(user.uid, choice === 'custom' ? customName : choice);
      setOpen(false); setChoice(''); setCustomName('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not add your crop. Please try again.'); }
    finally { setSaving(false); }
  }
  return <CropFrame title="My Crops" subtitle="Your crops, your plants, and their health over time.">
    <LoadState {...crops} />
    {!crops.loading && !crops.error && <div className="space-y-4">
      {crops.data.length === 0 && <div className="rounded-3xl border border-emerald-100 bg-white px-6 py-12 text-center"><Sprout className="mx-auto mb-5 h-12 w-12 text-emerald-600" /><h2 className="text-xl font-semibold text-emerald-950">Your farm starts here</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">Add your first crop, give your plants their own names, and keep every health check in one place.</p></div>}
      {crops.data.map(crop => <Link key={crop.id} href={`/my-crops/${crop.id}`} className="group flex items-center gap-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:p-6">
        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">{crop.nameKey === 'wheat' ? <Wheat className="h-8 w-8" /> : <Sprout className="h-8 w-8" />}</div>
        <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold text-emerald-950">{crop.name}</h2><p className="mt-1 text-sm text-slate-600">{crop.plantCount} {crop.plantCount === 1 ? 'plant' : 'plants'}</p><p className="mt-2 text-xs text-slate-400">{updatedLabel(crop.updatedAt)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-emerald-700 transition group-hover:translate-x-1" />
      </Link>)}
      <button onClick={() => { setError(''); setOpen(true); }} className="flex min-h-24 w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-emerald-300 bg-white/60 p-6 text-lg font-semibold text-emerald-800 transition hover:border-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"><Plus className="h-6 w-6" />Add your crop</button>
    </div>}
    <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next); }}><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Add your crop</DialogTitle><DialogDescription>Choose a crop or enter your own crop name.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="crop-type">Crop</Label><select id="crop-type" required value={choice} onChange={event => { setChoice(event.target.value); setError(''); }} disabled={saving} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="" disabled>Select your crop</option>{CROP_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}<option value="custom">Other — write your own</option></select></div>
      {choice === 'custom' && <div className="space-y-2"><Label htmlFor="crop-name">Crop name</Label><Input id="crop-name" autoFocus required maxLength={64} value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Enter your crop name" disabled={saving} className="h-12 rounded-xl" /></div>}
      {error && <ErrorNotice message={error} />}<Button type="submit" disabled={saving || !choice} className={`w-full ${greenButton}`}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{saving ? 'Saving…' : 'Add crop'}</Button></form>
    </DialogContent></Dialog>
  </CropFrame>;
}
