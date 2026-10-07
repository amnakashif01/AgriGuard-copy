'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronDown, Loader2, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { severityTone, type MyCrop, type MyPlant, type PlantRecord } from '@/lib/my-crops/models';
import { analyzeSavedPlantRecord } from '@/lib/my-crops/analyze-record';
import { CropFrame, ErrorNotice, greenButton, LoadState, useCropData } from './shared';

function RecordDetails({ record }: { record: PlantRecord }) {
  const result = record.diagnosis;
  if (!result) return null;
  return <details className="group mt-5 border-t border-emerald-50 pt-4">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-emerald-800">View analysis & treatment<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
    <div className="mt-5 space-y-5 text-sm leading-6 text-slate-600">
      {record.symptoms && <p><span className="font-semibold text-slate-800">Reported symptoms: </span>{record.symptoms}</p>}
      <div><h3 className="text-lg font-semibold text-emerald-950">{result.disease}</h3><p className="mt-1 text-xs text-slate-500">Diagnosis confidence: {result.confidence}% · Severity category: {result.severity}</p><p className="mt-3">{result.description}</p>{result.affectedParts.length > 0 && <p className="mt-2">Affected parts: {result.affectedParts.join(', ')}</p>}</div>
      {result.expertReviewRequired && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">This result needs an agricultural expert’s review.</p>}
      {result.plan && <section><h3 className="mb-3 font-semibold text-emerald-950">Treatment plan</h3><p className="mb-4 text-xs">{result.plan.timeline} · Estimated total: PKR {result.plan.totalCost.toLocaleString()}</p><ol className="space-y-4">{result.plan.steps.map(step => <li key={step.stepNumber} className="rounded-xl bg-[#f6f8f2] p-4"><h4 className="font-semibold text-slate-800">{step.stepNumber}. {step.title}</h4><p>{step.description}</p>{step.materials.length > 0 && <p className="mt-2">Materials: {step.materials.join(', ')}</p>}<p className="mt-2 text-xs">When: {step.timing} · Estimated cost: PKR {step.cost.toLocaleString()}</p>{step.safetyNotes && <p className="mt-2 text-xs font-medium text-amber-900">{step.safetyNotes}</p>}</li>)}</ol>{result.plan.preventionTips.length > 0 && <div className="mt-4"><h4 className="font-semibold text-slate-800">Prevention</h4><ul className="list-disc space-y-1 ps-5">{result.plan.preventionTips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></div>}</section>}
      {result.protectionPlan && <section><h3 className="font-semibold text-emerald-950">Protection plan · {result.protectionPlan.duration}</h3>{result.protectionPlan.phases.map(phase => <div key={phase.week} className="mt-3"><h4 className="font-medium text-slate-800">Week {phase.week}: {phase.title}</h4><ul className="list-disc ps-5">{phase.tasks.map((task, index) => <li key={index}>{task}</li>)}</ul></div>)}{result.protectionPlan.recommendations.length > 0 && <ul className="mt-4 list-disc ps-5">{result.protectionPlan.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>}</section>}
      <Link href={`/report/${record.reportId}`} className="inline-flex font-semibold text-emerald-700 underline underline-offset-4">Open full report</Link>
    </div>
  </details>;
}

export function TimelinePage({ cropId, plantId }: { cropId: string; plantId: string }) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const crops = useCropData<MyCrop>(`crops/${cropId}`);
  const plants = useCropData<MyPlant>(`crops/${cropId}/plants/${plantId}`);
  const records = useCropData<PlantRecord>(`crops/${cropId}/plants/${plantId}/records`, true);
  const [busyId, setBusyId] = useState('');
  const [retryError, setRetryError] = useState('');
  const crop = crops.data[0], plant = plants.data[0];
  const loading = crops.loading || plants.loading || records.loading;
  const error = crops.error || plants.error || records.error;
  async function retry(record: PlantRecord) {
    if (!user || busyId) return;
    setBusyId(record.id); setRetryError('');
    try { await analyzeSavedPlantRecord(user.uid, cropId, plantId, record.reportId, i18n.language === 'urdu' ? 'urdu' : 'english'); }
    catch (error) { setRetryError(error instanceof Error ? error.message : 'Could not analyze this record. Try again.'); }
    finally { setBusyId(''); }
  }
  return <CropFrame title={crop ? `${crop.name} Health Records` : 'Health Records'} eyebrow="PLANT TIMELINE" subtitle={plant ? `${plant.name} · ${plant.code}` : undefined} back={{ href: `/my-crops/${cropId}`, label: crop?.name || 'Back to crop' }}>
    <LoadState loading={loading} error={error} missing={!loading && (!crop || !plant)} />
    {!loading && !error && crop && plant && <div>
      <p className="mb-7 text-xs leading-5 text-slate-500">Every photo and analysis stays in this timeline. Severity is an AI estimate of visible symptoms from 0–100; it is separate from diagnosis confidence.</p>
      {retryError && <ErrorNotice message={retryError} />}
      <div className="space-y-6 border-s-2 border-emerald-200 ps-5 sm:ps-7">
        {records.data.map((record, index) => <article key={record.id} className="relative"><span aria-hidden="true" className="absolute -start-[27px] top-5 h-3 w-3 rounded-full border-2 border-[#f6f8f2] bg-emerald-600 sm:-start-[35px]" />
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-emerald-950">{record.age}</h2><span className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{new Date(record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · Record {index + 1}</span></div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><img src={record.imageThumb} alt={`${plant.name}, ${record.age}, record ${index + 1}`} className="h-44 w-full rounded-2xl bg-emerald-50 object-cover sm:h-32 sm:w-32" /><div className="min-w-0 flex-1">
              {record.status === 'Complete' ? <><p className="text-sm font-medium text-slate-600">AI-estimated severity</p><p className="mt-2 text-4xl font-semibold tracking-tight text-emerald-950">{record.severityScore ?? '—'}{record.severityScore !== null && <span className="text-xl font-normal text-slate-400"> / 100</span>}</p><div role="meter" aria-label="Estimated severity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={record.severityScore ?? undefined} aria-valuetext={record.severityScore === null ? 'Unavailable' : `${record.severityScore} out of 100`} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${severityTone(record.severityScore)}`} style={{ width: record.severityScore === null ? '0%' : `${record.severityScore}%` }} /></div>{record.severityExplanation && <p className="mt-3 text-xs leading-5 text-slate-500">{record.severityExplanation}</p>}</> : <><h3 className="font-semibold text-emerald-950">{busyId === record.id ? 'Analyzing your plant…' : record.status === 'Error' ? 'Analysis needs a retry' : 'Analysis not yet completed'}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{record.error || 'Your photo and record are saved. If the earlier analysis was interrupted, you can retry here.'}</p><Button type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => retry(record)} className="mt-4 rounded-xl">{busyId === record.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}{busyId === record.id ? 'Analyzing…' : 'Retry analysis'}</Button></>}
            </div></div>
            <RecordDetails record={record} />
          </div>
        </article>)}
      </div>
      {records.data.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No health records yet. Add your first photo below.</p>}
      <Button asChild className={`mt-8 w-full ${greenButton}`}><Link href={`/my-crops/${cropId}/${plantId}/new`}><Plus className="mr-2 h-5 w-5" />Add new record</Link></Button>
    </div>}
  </CropFrame>;
}
