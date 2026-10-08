'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CircleHelp, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { severityTone, type PlantRecord } from '@/lib/my-crops/models';
import { comparePlantRecords, completedPlantRecords, validSeverityScore, type RecordComparison } from '@/lib/my-crops/record-comparison';

function recordDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable';
}

function trendStyle(comparison: RecordComparison): string {
  if (comparison.reviewReasons.length) return 'border-amber-200 bg-amber-50 text-amber-950';
  if (comparison.direction === 'improving') return 'border-emerald-200 bg-emerald-50 text-emerald-950';
  if (comparison.direction === 'worsening') return 'border-orange-200 bg-orange-50 text-orange-950';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function TrendIcon({ comparison }: { comparison: RecordComparison }) {
  const Icon = comparison.direction === 'improving' ? TrendingDown : comparison.direction === 'worsening' ? TrendingUp : comparison.direction === 'unchanged' ? Minus : CircleHelp;
  return <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />;
}

function Snapshot({ record, label }: { record: PlantRecord; label: string }) {
  const score = validSeverityScore(record.severityScore);
  return <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{label}</p>
    <p className="mt-1 text-xs text-slate-500">{recordDate(record.createdAt)}</p>
    {record.imageThumb && <img src={record.imageThumb} alt={`${label}: ${record.age}`} width={320} height={160} loading="lazy" className="mt-3 h-32 w-full rounded-xl bg-emerald-50 object-contain" />}
    <p className="mt-3 break-words text-sm font-semibold text-emerald-950">{record.diagnosis?.disease || 'Diagnosis unavailable'}</p>
    <p className="mt-1 text-xs text-slate-500">Plant age: {record.age}</p>
    <p className="mt-3 text-sm text-slate-600">Severity: <strong className="text-emerald-950">{score === null ? record.diagnosis?.severity || 'Unavailable' : `${score}/100`}</strong></p>
    {score !== null && <div role="meter" aria-label={`${label} estimated severity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${severityTone(score)}`} style={{ width: `${score}%` }} /></div>}
    <Link href={`/report/${record.reportId}`} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">View {label.toLowerCase()} report<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
  </div>;
}

export function RecordChange({ previous, current }: { previous?: PlantRecord; current: PlantRecord }) {
  if (!previous) return <p className="mt-4 border-t border-emerald-50 pt-3 text-xs text-slate-500">Baseline test · No earlier completed test to compare.</p>;
  const comparison = comparePlantRecords(previous, current);
  return <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${trendStyle(comparison)}`}>
    <TrendIcon comparison={comparison} />
    <div className="min-w-0"><p className="text-sm font-semibold">{comparison.title}</p><p className="mt-1 text-xs leading-5">{comparison.summary}</p><p className="mt-1 text-xs opacity-80">Compared with {previous.age} · {recordDate(previous.createdAt)}</p></div>
  </div>;
}

export function PlantProgressComparison({ records, cropId, plantId }: { records: PlantRecord[]; cropId: string; plantId: string }) {
  const [selectedId, setSelectedId] = useState('');
  const selectId = useId();
  const complete = completedPlantRecords(records, cropId, plantId);
  const latest = complete[complete.length - 1];
  const earlier = complete.slice(0, -1);
  const previous = earlier.find(record => record.id === selectedId) || earlier[earlier.length - 1];
  const comparison = latest && previous ? comparePlantRecords(previous, latest) : null;
  const hasNewerIncomplete = latest && records.some(record => record.cropId === cropId && record.plantId === plantId && record.status !== 'Complete' && Date.parse(record.createdAt) > Date.parse(latest.createdAt));
  const firstComparison = latest && complete.length > 2 ? comparePlantRecords(complete[0], latest) : null;

  return <section aria-label="Plant progress comparison" className="mb-8 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold text-emerald-950">Progress comparison</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{complete.length} completed {complete.length === 1 ? 'test' : 'tests'}</span></div>
    {!comparison || !latest || !previous ? <div className="rounded-2xl bg-[#f6f8f2] p-4 text-sm leading-6 text-slate-600">
      <p className="font-semibold text-emerald-950">{latest ? 'Your first test is the baseline' : 'Start tracking your plant’s progress'}</p>
      <p className="mt-2">{latest ? 'Add another photo of this same plant using Add new record. Once its analysis finishes, we will compare the two tests here automatically.' : 'Complete two tests of this same plant to see whether its estimated condition is improving or worsening.'}</p>
      {latest && <p className="mt-2 text-xs">Baseline: {latest.diagnosis?.disease || 'Saved test'} · {recordDate(latest.createdAt)}</p>}
      <Link href={`/my-crops/${cropId}/${plantId}/new`} className="mt-3 inline-flex items-center gap-2 font-semibold text-emerald-700 hover:underline">Add new record<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
    </div> : <>
      <p className="mb-4 text-sm text-slate-600">Compare the latest completed test with an earlier record of this plant.</p>
      <label htmlFor={selectId} className="mb-2 block text-xs font-semibold text-slate-700">Compare latest test with</label>
      <select id={selectId} value={previous.id} onChange={event => setSelectedId(event.target.value)} className="mb-4 min-h-11 w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
        {earlier.map((record, index) => <option key={record.id} value={record.id}>Test {index + 1} · {record.age} · {recordDate(record.createdAt)}{index === earlier.length - 1 ? ' (previous test)' : index === 0 ? ' (first test)' : ''}</option>)}
      </select>
      <div aria-live="polite" aria-atomic="true" className={`rounded-2xl border p-4 ${trendStyle(comparison)}`}>
        <div className="flex items-center gap-2"><TrendIcon comparison={comparison} /><h3 className="text-lg font-semibold">{comparison.title}</h3></div>
        <p className="mt-2 text-sm leading-6">{comparison.summary}</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><Snapshot record={previous} label="Earlier test" /><Snapshot record={latest} label="Latest test" /></div>
      {comparison.diagnosisTitle && <div className="mt-5"><h3 className="text-sm font-semibold text-emerald-950">{comparison.diagnosisTitle}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{comparison.diagnosisSummary}</p></div>}
      {(comparison.parts.added.length > 0 || comparison.parts.removed.length > 0 || comparison.parts.continuing.length > 0) && <div className="mt-4 rounded-2xl bg-[#f6f8f2] p-4">
        <h3 className="mb-3 text-sm font-semibold text-emerald-950">Affected parts in the reports</h3>
        <dl className="space-y-2 text-xs leading-5">
          {comparison.parts.continuing.length > 0 && <div><dt className="font-semibold text-slate-700">Still reported</dt><dd className="text-slate-600">{comparison.parts.continuing.join(', ')}</dd></div>}
          {comparison.parts.added.length > 0 && <div><dt className="font-semibold text-orange-800">Newly reported</dt><dd className="text-slate-600">{comparison.parts.added.join(', ')}</dd></div>}
          {comparison.parts.removed.length > 0 && <div><dt className="font-semibold text-emerald-800">No longer reported</dt><dd className="text-slate-600">{comparison.parts.removed.join(', ')}</dd></div>}
        </dl>
        <p className="mt-3 text-xs leading-5 text-slate-500">A part missing from a newer report may be outside the photo; this alone does not confirm recovery.</p>
      </div>}
      {comparison.reviewReasons.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-semibold">Interpret with care</p><ul className="mt-1 list-disc space-y-1 ps-4">{comparison.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      {firstComparison && firstComparison.basis !== 'unavailable' && <p className="mt-4 border-t border-emerald-100 pt-3 text-xs leading-5 text-slate-600"><strong>Since the first test: </strong>{firstComparison.summary}</p>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-emerald-800">Read both saved observations</summary><div className="mt-3 grid gap-4 text-xs leading-6 text-slate-600 sm:grid-cols-2"><div><h4 className="font-semibold text-slate-800">Earlier test</h4><p className="mt-1">{previous.diagnosis?.description || 'No description was saved.'}</p>{previous.symptoms && <p className="mt-2"><strong>Reported symptoms: </strong>{previous.symptoms}</p>}</div><div><h4 className="font-semibold text-slate-800">Latest test</h4><p className="mt-1">{latest.diagnosis?.description || 'No description was saved.'}</p>{latest.symptoms && <p className="mt-2"><strong>Reported symptoms: </strong>{latest.symptoms}</p>}</div></div></details>
      <p className="mt-4 text-xs leading-5 text-slate-500">Based on saved AI estimates, not a new diagnosis or proof of cure. For a more useful comparison, photograph the same plant parts in similar lighting and at a similar distance.</p>
    </>}
    {hasNewerIncomplete && <p role="status" className="mt-4 text-xs leading-5 text-slate-500">A newer test is not complete yet. This comparison uses completed tests and will update when that analysis finishes.</p>}
  </section>;
}
