import React from 'react';
import {Badge} from '@/components/ui/badge';
import {ScanSearch, Sparkles} from 'lucide-react';
import type {DiagnosisReport} from '@/lib/models';

/** Labels come only from persisted provenance; legacy records are not guessed. */
export default function ReportModelBadge({report}: {report: Pick<DiagnosisReport, 'status' | 'cropEvidence' | 'inference'>}) {
  if (report.status !== 'Complete') return null;
  const confirmed = report.cropEvidence?.route === 'model_assisted' && Boolean(report.cropEvidence.accepted);
  const agriChat = !report.cropEvidence && report.inference?.provider === 'agrichat';
  if (!report.cropEvidence && !agriChat) return null;
  const label = confirmed ? 'YOLO11m + Gemini' : agriChat ? 'AgriChat + Gemini' : 'Gemini fallback';
  return <Badge variant="outline" title={confirmed ? 'YOLO11m diagnosis with Gemini image review and care plan' : agriChat ? 'AgriChat diagnosis with Gemini supporting care information' : report.cropEvidence?.reason} className={`max-w-full gap-1.5 whitespace-normal text-left text-[11px] leading-snug ${confirmed || agriChat ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800' : 'border-amber-200 bg-amber-50/70 text-amber-800'}`}>
    {confirmed || agriChat ? <ScanSearch aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/> : <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>}
    {label}
  </Badge>;
}
