import React from 'react';
import {Badge} from '@/components/ui/badge';
import {ScanSearch, Sparkles} from 'lucide-react';
import type {DiagnosisReport} from '@/lib/models';
import { diagnosisModelName } from '@/lib/crop-detector';

/** Labels come only from persisted provenance; legacy records are not guessed. */
export default function ReportModelBadge({report}: {report: Pick<DiagnosisReport, 'status' | 'cropEvidence' | 'inference'>}) {
  if (report.status !== 'Complete') return null;
  const confirmed = report.cropEvidence?.route === 'model_assisted' && Boolean(report.cropEvidence.accepted);
  const agriChat = !report.cropEvidence && report.inference?.provider === 'agrichat';
  if (!report.cropEvidence && !agriChat) return null;
  const name = report.cropEvidence && diagnosisModelName(report.cropEvidence) === 'DaViT-Base' ? 'DaViT' : 'YOLO11m';
  const label = confirmed ? `${name} + Gemini` : agriChat ? 'AgriChat + Gemini' : 'Crop analysis complete';
  return <Badge variant="outline" title={confirmed ? `${name} diagnosis with Gemini image review and care plan` : agriChat ? 'AgriChat diagnosis with Gemini supporting care information' : 'Crop analysis with Gemini image assessment and care guidance'} className={`max-w-full gap-1.5 whitespace-normal text-left text-[11px] leading-snug ${confirmed || agriChat ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800' : 'border-slate-200 bg-slate-50/70 text-slate-600'}`}>
    {confirmed || agriChat ? <ScanSearch aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/> : <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>}
    {label}
  </Badge>;
}
