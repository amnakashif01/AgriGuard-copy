'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleHelp, Leaf, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { severityTone, type PlantRecord } from '@/lib/my-crops/models';
import { comparePlantRecords, validSeverityScore, type RecordComparison } from '@/lib/my-crops/record-comparison';

import { plantComparisonHistory, resolveComparisonPair, comparisonWindow, type DisplayTest } from '@/lib/my-crops/comparison-history';

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

export function RecordChange({ previous, current }: { previous?: PlantRecord; current: PlantRecord }) {
  if (!previous) return <p className="mt-4 border-t border-emerald-50 pt-3 text-xs text-slate-500">Baseline test · No earlier completed test to compare.</p>;
  const comparison = comparePlantRecords(previous, current);
  return <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${trendStyle(comparison)}`}>
    <TrendIcon comparison={comparison} />
    <div className="min-w-0"><p className="text-sm font-semibold">{comparison.title}</p><p className="mt-1 text-xs leading-5">{comparison.summary}</p><p className="mt-1 text-xs opacity-80">Compared with {previous.age} · {recordDate(previous.createdAt)}</p></div>
  </div>;
}

function ChangeBadge({ comparison }: { comparison: RecordComparison }) {
  const delta = comparison.change;
  return <div title={[comparison.summary, ...comparison.reviewReasons].join(' ')} className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-2 sm:px-3 text-sm font-medium leading-5 ${trendStyle(comparison)}`}>
    <span className="hidden sm:block"><TrendIcon comparison={comparison} /></span>
    <span className="min-w-0 break-words">{delta !== null && <span className="font-semibold">{delta > 0 ? '+' : ''}{delta} {Math.abs(delta) === 1 ? 'point' : 'points'} · </span>}{comparison.title}</span>
  </div>;
}

function TestCard({ record, number, latest, comparison, comparisonNote }: DisplayTest & { latest: boolean }) {
  const score = validSeverityScore(record.severityScore);
  const severity = record.diagnosis?.severity;
  const badge = severity === 'High' ? 'bg-orange-100 text-orange-900' : severity === 'Medium' ? 'bg-amber-100 text-amber-900' : severity === 'Low' || severity === 'None' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600';
  return <article aria-label={`Test ${number}${latest ? ', latest' : ''}`} className={`flex min-w-0 flex-col rounded-2xl border p-2.5 sm:p-4 ${latest ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
    <div className="flex flex-wrap items-center justify-between gap-1"><h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Test {number}</h3>{(latest || number === 1) && <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${latest ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{latest ? 'Latest' : 'Baseline'}</span>}</div>
    <time dateTime={record.createdAt} title={`${recordDate(record.createdAt)} · Age: ${record.age}`} className="mt-1 block text-sm leading-5 text-slate-500">{Number.isFinite(Date.parse(record.createdAt)) ? new Date(record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}</time>
    {record.imageThumb ? <img src={record.imageThumb} alt={`Test ${number}: ${record.age}`} width={280} height={120} loading="lazy" className="mt-2 h-32 sm:h-44 w-full rounded-lg bg-emerald-50 object-contain" /> : <div className="mt-2 flex h-32 sm:h-44 items-center justify-center rounded-lg bg-emerald-50 text-emerald-300"><Leaf aria-label="No saved photo" className="h-8 w-8" /></div>}
    <p className="mt-2 text-sm text-slate-500">Estimated severity</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-1"><strong className="text-2xl sm:text-3xl tracking-tight text-slate-900">{score === null ? '—' : <>{score}<span className="text-sm font-normal">/100</span></>}</strong><span className={`rounded-md px-2 py-1 text-sm font-semibold ${badge}`}>{severity || 'Unavailable'}</span></div>
    {score !== null ? <div role="meter" aria-label={`Test ${number} estimated severity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${severityTone(score)}`} style={{ width: `${score}%` }} /></div> : <p className="mt-1 text-sm text-slate-500">Numeric score unavailable</p>}
    <div className="mt-2 border-t border-slate-100 pt-2"><p className="text-sm text-slate-500">Disease reported</p><p title={record.diagnosis?.disease} className="mt-1 line-clamp-2 min-h-12 break-words text-base font-semibold leading-6 text-slate-900">{record.diagnosis?.disease || 'Diagnosis unavailable'}</p></div>
    <div className="mt-2">{comparison && <ChangeBadge comparison={comparison} />}<p className="mt-1 text-sm text-slate-500">{comparisonNote}</p></div>
    <Link href={`/report/${record.reportId}`} aria-label={`Open Test ${number} report`} className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-emerald-700 underline underline-offset-2">Open report<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
  </article>;
}

export function PairComparisonDetails({ earlier, newer, earlierNumber, newerNumber, comparison }: NonNullable<ReturnType<typeof resolveComparisonPair>>) {
  return <div className="mt-4 rounded-2xl border border-emerald-100 bg-[#fbfcf9] p-4" aria-label="Selected tests comparison" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-emerald-950">Test {earlierNumber} <span className="font-normal text-slate-400">vs</span> Test {newerNumber}</h3><ChangeBadge comparison={comparison} /></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">{comparison.summary}</p>
    {comparison.diagnosisTitle && <div className="mt-3 text-sm leading-5 text-slate-600"><p className="font-semibold text-slate-800">{comparison.diagnosisTitle}</p><p className="mt-1">{comparison.diagnosisSummary}</p></div>}
    <dl className="mt-3 space-y-1 text-sm leading-5">
      {comparison.parts.continuing.length > 0 && <div><dt className="inline font-semibold text-slate-700">Still reported: </dt><dd className="inline text-slate-600">{comparison.parts.continuing.join(', ')}</dd></div>}
      {comparison.parts.added.length > 0 && <div><dt className="inline font-semibold text-orange-800">Newly reported: </dt><dd className="inline text-slate-600">{comparison.parts.added.join(', ')}</dd></div>}
      {comparison.parts.removed.length > 0 && <div><dt className="inline font-semibold text-slate-700">No longer reported: </dt><dd className="inline text-slate-600">{comparison.parts.removed.join(', ')}. This alone does not confirm recovery.</dd></div>}
    </dl>
    {comparison.reviewReasons.length > 0 && <ul className="mt-3 list-disc space-y-1 rounded-xl bg-amber-50 py-2 pl-6 pr-3 text-sm leading-5 text-amber-900">{comparison.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-emerald-800">Read both saved observations</summary><div className="mt-3 grid gap-4 leading-6 text-slate-600 sm:grid-cols-2">{[{ record: earlier, number: earlierNumber }, { record: newer, number: newerNumber }].map(({ record, number }) => <div key={record.id}><h4 className="font-semibold text-slate-800">Test {number} · {recordDate(record.createdAt)}</h4><p className="mt-1">{record.diagnosis?.description || 'No description was saved.'}</p>{record.symptoms && <p className="mt-2"><strong>Reported symptoms: </strong>{record.symptoms}</p>}<Link href={`/report/${record.reportId}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">View Test {number} report<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></div>)}</div></details>
  </div>;
}

export function ComparisonCards({ entries, latestNumber }: { entries: DisplayTest[]; latestNumber: number }) {
  return <div className="crop-comparison-grid" data-single={entries.length === 1 ? 'true' : undefined}>
    {entries.map(entry => <TestCard key={entry.record.id} {...entry} latest={latestNumber > 1 && entry.number === latestNumber} />)}
  </div>;
}

export function PlantProgressComparison({ records, cropId, plantId }: { records: PlantRecord[]; cropId: string; plantId: string }) {
  const [testId, setTestId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [showPair, setShowPair] = useState(false);
  const [page, setPage] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const id = useId();
  const history = plantComparisonHistory(records, cropId, plantId);
  const { complete, entries, overall } = history;
  const latest = complete[complete.length - 1];
  const pair = resolveComparisonPair(complete, testId, compareId);
  const comparing = showPair && !!pair;
  const view = comparisonWindow(history, page, comparing ? pair : null);
  const summary = comparing ? pair.comparison : overall;
  const lastChange = entries[entries.length - 1]?.comparison;
  const incomplete = records.filter(record => record.cropId === cropId && record.plantId === plantId && record.status !== 'Complete').length;
  const hasNewerIncomplete = latest && records.some(record => record.cropId === cropId && record.plantId === plantId && record.status !== 'Complete' && Date.parse(record.createdAt) > Date.parse(latest.createdAt));
  const diagnosisChanged = view.entries.some(entry => entry.comparison?.diagnosisTitle === 'Reported diagnosis changed');
  const changePage = (direction: number) => setPage(Math.min(Math.max(view.page + direction, 0), Math.max(view.pageCount - 1, 0)));
  const selectClass = 'min-h-12 w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600';

  return <section aria-label="Plant progress comparison" className="mb-8 min-w-0 rounded-3xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-5 lg:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-semibold tracking-tight text-emerald-950">Plant health comparison</h2><p className="mt-1 text-sm text-slate-500">{complete.length} completed {complete.length === 1 ? 'test' : 'tests'} · Browse two at a time</p></div>
      {latest && <Link href={`/report/${latest.reportId}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">View latest report<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
    </div>

    {pair && <div className="mb-4 rounded-xl bg-emerald-50/50 p-3" aria-label="Choose tests to compare">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-36">
          <label htmlFor={`${id}-test`} className="mb-1.5 block text-sm font-semibold text-slate-700">Compare specific tests</label>
          <select id={`${id}-test`} value={pair.selected.id} onChange={event => { setTestId(event.target.value); setShowPair(true); }} className={selectClass}>
            {entries.map(({ record, number }) => <option key={record.id} value={record.id}>Test {number}{number === complete.length ? ' (latest)' : ''} · {record.age}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1 basis-36">
          <label htmlFor={`${id}-against`} className="mb-1.5 block text-sm font-semibold text-slate-700">Compare with</label>
          <select id={`${id}-against`} value={pair.against.id} onChange={event => { setCompareId(event.target.value); setShowPair(true); }} className={selectClass}>
            {entries.filter(({ record }) => record.id !== pair.selected.id).map(({ record, number }) => <option key={record.id} value={record.id}>Test {number} · {record.age}</option>)}
          </select>
        </div>
        <button type="button" aria-pressed={comparing} aria-controls={`${id}-display`} onClick={() => setShowPair(!comparing)} className="min-h-12 rounded-xl border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">{comparing ? 'Browse all tests' : 'Compare'}</button>
      </div>
      <p className="mt-2 text-sm text-slate-500">{comparing ? 'Photos, scores and findings below match your selected tests.' : 'Choose any two tests to compare their photos and results together.'}</p>
    </div>}

    {!summary ? <div className="rounded-2xl bg-[#f6f8f2] p-4 text-sm leading-6 text-slate-600">
      <p className="font-semibold text-emerald-950">{latest ? 'Your first test is the baseline' : 'Start tracking your plant’s progress'}</p>
      <p className="mt-2">{latest ? 'Add another photo of this same plant using Add new record. Once its analysis finishes, the progress will appear here automatically.' : 'Complete two tests of this same plant to see whether its estimated condition is improving or worsening.'}</p>
      <Link href={`/my-crops/${cropId}/${plantId}/new`} className="mt-3 inline-flex items-center gap-2 font-semibold text-emerald-700 hover:underline">Add new record<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
    </div> : <div aria-live="polite" aria-atomic="true" className={`rounded-xl border p-4 ${trendStyle(summary)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><TrendIcon comparison={summary} /><div><h3 className="text-xl font-semibold">{summary.title}{!comparing && (summary.direction === 'improving' || summary.direction === 'worsening') ? ' overall' : ''}</h3><p className="mt-0.5 text-sm opacity-75">{comparing ? `Test ${pair.earlierNumber} → Test ${pair.newerNumber}` : 'First test → latest test'}</p></div></div>
        {summary.change !== null && <div><p className="text-2xl font-semibold tabular-nums">{summary.previousScore} → {summary.currentScore}<span className="text-sm font-normal"> /100</span></p><p className="mt-0.5 text-sm">{summary.change === 0 ? 'No score change' : `${Math.abs(summary.change)} points ${summary.change < 0 ? 'lower' : 'higher'}`}</p></div>}
      </div>
      {summary.change === null && <p className="mt-2 text-sm leading-5">{summary.summary}</p>}
      {!comparing && complete.length > 2 && lastChange && <p className="mt-2 border-t border-current/10 pt-2 text-sm leading-5"><strong>Latest change · Test {complete.length - 1} → {complete.length}: </strong>{lastChange.title}. {lastChange.change !== null ? `${Math.abs(lastChange.change)} points ${lastChange.change < 0 ? 'lower' : lastChange.change > 0 ? 'higher' : 'change'}.` : lastChange.summary}</p>}
      {summary.reviewReasons.length > 0 && <details className="mt-2 text-sm leading-5"><summary className="cursor-pointer font-semibold">Interpret with care</summary><ul className="mt-1 list-disc space-y-1 pl-4">{summary.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}
    </div>}

    {complete.length > 0 && <div id={`${id}-display`}>
      <div className="mb-3 mt-4 flex items-center justify-between gap-2">
        <p role="status" className="text-sm font-medium text-slate-600">{comparing ? `Comparing Test ${pair.earlierNumber} & Test ${pair.newerNumber}` : view.entries.length === 1 ? 'Test 1 of 1' : `Tests ${view.entries[0].number}–${view.entries[view.entries.length - 1].number} of ${complete.length}`}</p>
        {!comparing && complete.length > 1 && <div className="flex items-center gap-1">
          <button type="button" aria-label="Show earlier tests" aria-controls={`${id}-photos`} disabled={view.page === 0} onClick={() => changePage(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" aria-label="Show later tests" aria-controls={`${id}-photos`} disabled={view.page >= view.pageCount - 1} onClick={() => changePage(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
        </div>}
      </div>
      <div id={`${id}-photos`} role="region" aria-label={comparing ? 'Selected test photos' : 'Test history, two tests per page'} tabIndex={0}
        className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        style={{ touchAction: 'pan-y pinch-zoom' }}
        onKeyDown={event => { if (comparing || event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); changePage(event.key === 'ArrowRight' ? 1 : -1); } }}
        onTouchStart={event => { touchStart.current = !comparing && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
        onTouchCancel={() => { touchStart.current = null; }}
        onTouchEnd={event => { const start = touchStart.current; touchStart.current = null; if (!start || comparing || event.changedTouches.length !== 1) return; const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) changePage(dx < 0 ? 1 : -1); }}>
        <ComparisonCards key={view.entries.map(entry => entry.record.id).join('/')} entries={view.entries} latestNumber={complete.length} />
      </div>
      {!comparing && complete.length > 1 && <p className="mt-2 text-sm text-slate-500">{view.pageCount > 1 ? 'Use the arrows or swipe to browse. ' : ''}Each change is measured against the previous test.</p>}
      {comparing && <details className="mt-3 rounded-xl border border-emerald-100 p-3"><summary className="cursor-pointer text-sm font-semibold text-emerald-800">Comparison details · Test {pair.earlierNumber} vs Test {pair.newerNumber}</summary><PairComparisonDetails {...pair} /></details>}
      {view.entries.length > 1 && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-2.5 sm:p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Findings · Test {view.entries[0].number} & Test {view.entries[1].number}</h3>
        <div className="max-h-64 overflow-auto"><table className="w-full table-fixed border-collapse text-left text-sm leading-5">
          <caption className="sr-only">Affected parts in the two displayed tests</caption>
          <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr><th scope="col" className="w-[30%] px-2 py-2 font-semibold">Finding</th>{view.entries.map(({ record, number }) => <th key={record.id} scope="col" className="px-2 py-2 font-semibold">Test {number}</th>)}</tr></thead>
          <tbody>{view.parts.length ? view.parts.map(([key, label]) => <tr key={key} className="border-b border-slate-100"><th scope="row" className="break-words px-2 py-2 font-medium capitalize text-slate-700">{label}</th>{view.entries.map(({ record }, index) => { const known = !!record.diagnosis && Array.isArray(record.diagnosis.affectedParts); const reported = view.reportedParts[index].has(key); return <td key={record.id} className="px-2 py-2"><span className={`inline-flex items-baseline gap-1.5 ${known && reported ? 'text-slate-700' : 'text-slate-500'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${known && reported ? 'bg-amber-500' : 'bg-slate-300'}`} />{!known ? 'Unavailable' : reported ? 'Reported' : 'Not reported'}</span></td>; })}</tr>) : <tr><td colSpan={3} className="px-2 py-3 text-slate-500">No affected parts were listed in these saved reports.</td></tr>}</tbody>
        </table></div>
        <p className="mt-3 text-sm leading-5 text-slate-500">Not reported does not confirm an issue is resolved.{diagnosisChanged && ' A changed diagnosis label does not prove the earlier condition has resolved.'}</p>
      </div>}
    </div>}
    {incomplete > 0 && <p role="status" className="mt-3 text-sm leading-5 text-slate-500">{hasNewerIncomplete ? 'A newer test is not complete yet. ' : ''}{incomplete} processing or failed {incomplete === 1 ? 'test is' : 'tests are'} excluded. The comparison updates when analysis finishes.</p>}
    {latest && <p className="mt-3 text-sm leading-5 text-slate-500">AI estimates from saved reports, not proof of cure. Compare the same plant parts in similar lighting.</p>}
  </section>;
}
