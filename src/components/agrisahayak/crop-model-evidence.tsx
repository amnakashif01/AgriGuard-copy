'use client';

import React, {useId, useState} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {CheckCircle2, ChevronDown, LayoutGrid, Network, ScanSearch, Sparkles, type LucideIcon} from 'lucide-react';
import {diagnosisModelName, DETECTOR_MIN_SCORE, type CropEvidence} from '@/lib/crop-detector';

type ModelCardProps = {
  name: string;
  variant?: string;
  description: string;
  icon: LucideIcon;
  completed: boolean;
  status: string;
  score?: number;
};

function ModelCard({name, variant, description, icon: Icon, completed, status, score}: ModelCardProps) {
  return <section aria-label={`${name} analysis`} className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-background/80 sm:p-5">
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 h-8 w-8 shrink-0 text-emerald-700 dark:text-emerald-400"/>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">{name}</h3>
          {variant && <Badge variant="outline" className="bg-slate-50 font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">{variant}</Badge>}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline" className={`gap-1.5 whitespace-normal rounded-lg px-2.5 py-1.5 text-xs font-medium ${completed ? 'border-transparent bg-emerald-100/80 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
            {completed && <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0"/>}{status}
          </Badge>
          {score !== undefined && <p className="text-sm text-slate-600 dark:text-slate-300">Model score <strong className="ml-1 text-lg tabular-nums text-emerald-800 dark:text-emerald-200">{score.toFixed(2)}%</strong></p>}
        </div>
      </div>
    </div>
  </section>;
}

export default function CropModelEvidence({evidence, imageUrl}: {evidence:CropEvidence; imageUrl?:string}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const accepted = evidence.route === 'model_assisted' ? evidence.accepted : undefined;
  const davitAccepted = Boolean(accepted && diagnosisModelName(evidence) === 'DaViT-Base');
  const yoloCompleted = evidence.detector.status === 'detected';
  const davitCompleted = evidence.classifier?.status === 'classified' && Boolean(evidence.classifier.prediction);
  const score = accepted && Number.isFinite(accepted.score) && accepted.score >= DETECTOR_MIN_SCORE && accepted.score <= 100 ? accepted.score : undefined;
  const regions = accepted && !davitAccepted && yoloCompleted ? evidence.detector.detections.filter(d => d.score >= DETECTOR_MIN_SCORE) : [];
  return <Card className="overflow-hidden border-emerald-300 bg-gradient-to-br from-emerald-50/70 to-white shadow-sm dark:border-emerald-800 dark:from-emerald-950/40 dark:to-background">
    <CardHeader className="p-4 pb-4 sm:p-6 sm:pb-4">
      <div className="flex items-start gap-3">
        <LayoutGrid aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400"/>
        <div>
          <CardTitle className="text-xl leading-snug text-slate-950 sm:text-2xl dark:text-slate-100">Model Analysis</CardTitle>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Specialized crop model checks for this report</p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
      <div className="grid gap-4 lg:grid-cols-2">
        <ModelCard name="YOLO11m" description="Leaf detection & disease screening" icon={ScanSearch} completed={yoloCompleted}
          status={yoloCompleted ? 'Analysis completed' : evidence.detector.status === 'unsupported' ? 'Not applicable to this crop' : 'Not available for this report'}
          score={yoloCompleted && !davitAccepted ? score : undefined}/>
        <ModelCard name="DaViT" variant="Base" description="Crop & condition classification" icon={Network} completed={davitCompleted}
          status={davitCompleted ? 'Analysis completed' : evidence.classifier ? 'Not available for this report' : 'Not run for this report'}
          score={davitCompleted && davitAccepted ? score : undefined}/>
      </div>
      <div className="mt-4 flex items-start gap-3 border-t border-emerald-100 pt-4 dark:border-emerald-900">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"/>
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">AI image review & care plan · Gemini</p>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{accepted ? 'Image review, estimated severity and care guidance provided by Gemini.' : 'Image assessment and care guidance provided by Gemini.'}</p>
        </div>
      </div>
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-300 dark:hover:bg-emerald-900/50">
        {expanded ? 'Hide model details' : 'View model details'}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
      </button>
      <div id={detailsId} hidden={!expanded} className="mt-2 space-y-3 border-t border-emerald-100 pt-4 text-sm leading-relaxed text-slate-600 dark:border-emerald-900 dark:text-slate-300">
        <p><strong>YOLO11m:</strong> Leaf detection and disease screening across 29 PlantDoc leaf categories.{yoloCompleted && ` Processing time: ${(evidence.detector.elapsedMs / 1000).toFixed(2)} s.`}</p>
        <p><strong>DaViT-Base:</strong> Crop, disease and pest classification.{davitCompleted && evidence.classifier && ` Processing time: ${(evidence.classifier.elapsedMs / 1000).toFixed(2)} s.`}{!evidence.classifier && (accepted ? ' The YOLO result was accepted first, so this model was not run.' : 'No result from this model was recorded for this report.')}</p>
        {score !== undefined && <p>{davitAccepted ? 'DaViT' : 'YOLO11m'} supplied the accepted crop and condition. Model score is not measured accuracy.</p>}
        {davitAccepted && evidence.classifier?.prediction && <p>Crop score: {evidence.classifier.prediction.crop.score.toFixed(2)}% · Category score: {evidence.classifier.prediction.category.score.toFixed(2)}% · Condition score: {evidence.classifier.prediction.condition.score.toFixed(2)}%. The displayed model score is the lowest of these three checks.</p>}
        <p>Severity and image highlights are Gemini visual estimates. Completed checks indicate that a model ran; the report above contains the final image assessment.</p>
        {expanded && imageUrl && regions.length > 0 && <>
          <p>Green boxes show detected leaves, not the diseased area.</p>
          <div className="relative mx-auto max-w-xl overflow-hidden rounded-lg">
            {/* Native image dimensions keep normalized overlays aligned without cropping. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Crop photo with model-detected leaf regions" className="block h-auto w-full"/>
            {regions.map((r,i) => <div key={i} aria-hidden="true" className="pointer-events-none absolute border-2 border-emerald-500" style={{top:`${r.box[0]/10}%`,left:`${r.box[1]/10}%`,height:`${(r.box[2]-r.box[0])/10}%`,width:`${(r.box[3]-r.box[1])/10}%`}}/>)}
          </div>
        </>}
      </div>
    </CardContent>
  </Card>;
}
