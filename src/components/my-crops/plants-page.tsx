'use client';

import Link from 'next/link';
import { ChevronRight, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MyCrop, MyPlant } from '@/lib/my-crops/models';
import { CropFrame, greenButton, LoadState, updatedLabel, useCropData } from './shared';

export function PlantsPage({ cropId }: { cropId: string }) {
  const cropState = useCropData<MyCrop>(`crops/${cropId}`);
  const plants = useCropData<MyPlant>(`crops/${cropId}/plants`, true);
  const crop = cropState.data[0];
  const loading = cropState.loading || plants.loading;
  const error = cropState.error || plants.error;
  return <CropFrame title={crop?.name || 'Your crop'} eyebrow="MY CROPS" subtitle={crop ? `${plants.data.length} ${plants.data.length === 1 ? 'plant' : 'plants'} · A health history for every plant.` : undefined} back={{ href: '/my-crops', label: 'My Crops' }}>
    <LoadState loading={loading} error={error} missing={!loading && !crop} />
    {!loading && !error && crop && <div className="space-y-5">
      {plants.data.length === 0 && <div className="rounded-3xl border border-emerald-100 bg-white p-10 text-center"><Sprout className="mx-auto mb-4 h-10 w-10 text-emerald-600" /><h2 className="text-xl font-semibold text-emerald-950">Add your first plant</h2><p className="mt-3 text-sm leading-6 text-slate-500">Give it a unique name and take a photo to start its health timeline.</p></div>}
      {plants.data.map(plant => <Link key={plant.id} href={`/my-crops/${cropId}/${plant.id}`} className="group flex items-center gap-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:gap-6 sm:p-5">
        <img src={plant.imageThumb} alt={plant.name} className="h-24 w-24 shrink-0 rounded-2xl bg-emerald-50 object-cover sm:h-32 sm:w-32" />
        <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold text-emerald-950">{plant.name}</h2><p className="mt-1 text-sm font-medium tracking-wide text-emerald-700">{plant.code}</p><p className="mt-3 text-xs text-slate-500">{plant.recordCount} {plant.recordCount === 1 ? 'record' : 'records'} · {updatedLabel(plant.updatedAt)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-emerald-700" />
      </Link>)}
      <Button asChild className={`w-full ${greenButton}`}><Link href={`/my-crops/${cropId}/new`}><Plus className="mr-2 h-5 w-5" />Add your plant</Link></Button>
    </div>}
  </CropFrame>;
}
