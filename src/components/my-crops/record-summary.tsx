'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { severityTone, type PlantRecord } from '@/lib/my-crops/models';

export function RecordSummary({ record, busy = false, retrying = false, onRetrySeverity }: { record: PlantRecord; busy?: boolean; retrying?: boolean; onRetrySeverity?: () => void }) {
  const score = record.severityScore;
  const hasScore = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
  return <div className="min-w-0 flex-1">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Report ready</span><Button asChild size="sm" className="rounded-xl bg-emerald-700 hover:bg-emerald-800"><Link href={`/report/${record.reportId}`}>View Full Report<ArrowUpRight className="ms-2 h-4 w-4" /></Link></Button></div>
    {hasScore ? <><p className="text-sm font-medium text-slate-600">AI-estimated severity</p><p className="mt-2 text-4xl font-semibold tracking-tight text-emerald-950">{score}<span className="text-xl font-normal text-slate-400"> / 100</span></p><div role="meter" aria-label="Estimated severity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${severityTone(score)}`} style={{ width: `${score}%` }} /></div>{record.severityExplanation && <p className="mt-3 text-xs leading-5 text-slate-500">{record.severityExplanation}</p>}</> : <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-medium text-slate-700">Severity estimate unavailable</p><p className="mt-1 text-xs leading-5 text-slate-500">Your diagnosis and treatment are ready. A severity score could not be calculated from this analysis.</p>{onRetrySeverity && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetrySeverity} className="mt-3 rounded-lg">{retrying ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RotateCcw className="me-2 h-4 w-4" />}{retrying ? 'Calculating severity…' : 'Retry severity estimate'}</Button>}</div>}
  </div>;
}
