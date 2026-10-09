'use client';

import React, {useId, useState} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {ChevronDown, CircleDot, Info, ScanSearch, Sparkles} from 'lucide-react';
import {diagnosisModelName, modelFallbackReason, DETECTOR_MIN_SCORE, type CropEvidence} from '@/lib/crop-detector';
import {CLASSIFIER_MIN_SCORE} from '@/lib/crop-classifier';

export default function CropModelEvidence({evidence, imageUrl}: {evidence:CropEvidence; imageUrl?:string}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const accepted = evidence.route === 'model_assisted' ? evidence.accepted : undefined;
  const confirmed = Boolean(accepted);
  const davit = confirmed && diagnosisModelName(evidence) === 'DaViT-Base';
  const modelLabel = davit ? 'DaViT-Base' : 'YOLO11m · PlantDoc';
  const regions = confirmed && !davit ? evidence.detector.detections.filter(d=>d.score>=DETECTOR_MIN_SCORE) : [];
  const topDetection = evidence.detector.detections.reduce<typeof evidence.detector.detections[number] | undefined>((top, detection) => !top || detection.score > top.score ? detection : top, undefined);
  const classifierPrediction = evidence.classifier?.status === 'classified' ? evidence.classifier.prediction : undefined;
  return <Card className="overflow-hidden border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm dark:border-emerald-800 dark:from-emerald-950/40 dark:to-background">
    <CardHeader className="gap-2 p-4 pb-3 sm:p-6 sm:pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-start gap-3 text-lg leading-snug text-emerald-950 sm:text-xl dark:text-emerald-100">
          <ScanSearch aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400"/>
          Model used for this diagnosis
        </CardTitle>
        <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(value=>!value)} className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-200 dark:hover:bg-emerald-900/50 sm:self-auto">
          {expanded ? 'Hide model details' : 'View model details'}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
        </button>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
      <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 dark:border-emerald-900 dark:bg-background/70 sm:px-5">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {confirmed ? <CircleDot aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-emerald-800 dark:text-emerald-400"/> : <Sparkles aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-emerald-800 dark:text-emerald-400"/>}
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl dark:text-slate-100">{confirmed ? modelLabel : 'Gemini'}</p>
                <Badge variant="outline" className={confirmed ? 'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'}>{confirmed ? 'Diagnosis model' : 'Gemini fallback'}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{confirmed ? davit ? 'Identified the crop and condition' : 'Identified the crop and leaf condition' : 'Provided the image assessment and care report'}</p>
            </div>
          </div>
          {accepted && Number.isFinite(accepted.score) && <div className="flex items-baseline justify-between gap-3 border-t border-emerald-100 pt-3 sm:block sm:min-w-32 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 dark:border-emerald-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">{davit ? 'Model score' : 'Detector score'}</p>
            <p className="text-xl font-bold tabular-nums text-slate-950 sm:mt-0.5 sm:text-2xl dark:text-white">{accepted.score.toFixed(2)}%</p>
          </div>}
        </div>
        <div className="flex items-start gap-3 border-t border-emerald-100 py-4 dark:border-emerald-900">
          {confirmed ? <Sparkles aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-emerald-800 dark:text-emerald-400"/> : <ScanSearch aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-slate-500"/>}
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-950 sm:text-lg dark:text-slate-100">{confirmed ? 'Gemini' : evidence.classifier ? 'YOLO11m + DaViT checks' : 'YOLO11m · PlantDoc'}</p>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{confirmed ? 'Image review, estimated severity & care plan' : modelFallbackReason(evidence)}</p>
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0"/>
        <span>{confirmed && (davit ? 'Model score is not measured accuracy. ' : 'Detector score is not measured accuracy. ')}Severity and red circles are Gemini visual estimates.</span>
      </p>
      <div id={detailsId} hidden={!expanded} className="space-y-3 border-t border-emerald-200 pt-4 text-sm leading-relaxed text-slate-600 dark:border-emerald-800 dark:text-slate-300">
        <p className="font-medium text-slate-900 dark:text-slate-100">What each model returned</p>
        <p><strong>YOLO11m:</strong> {evidence.detector.status === 'unavailable' ? 'Could not process this image. This is a processing failure, not a low-confidence prediction.' : evidence.detector.status === 'unsupported' ? 'Skipped: the selected crop is outside its trained leaf categories.' : topDetection ? `Completed. Best leaf candidate: ${topDetection.label} (${topDetection.score.toFixed(2)}% raw score). ${topDetection.score < DETECTOR_MIN_SCORE ? `Below the ${DETECTOR_MIN_SCORE}% confirmation threshold.` : 'Passing the score threshold still requires matching crop and image review.'}` : 'Completed. No leaf candidate was detected above the 15% reporting floor.'}</p>
        <p><strong>DaViT:</strong> {!evidence.classifier ? confirmed ? 'Not run: the YOLO result was accepted first.' : 'No DaViT result was recorded. This report may predate the broader model.' : evidence.classifier.status === 'unavailable' ? 'Could not process this image. This is a processing failure, not a low-confidence prediction.' : 'Completed. Its predictions and scores are shown below.'}</p>
        {classifierPrediction && <dl className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 sm:grid-cols-3">
          {([
            ['Crop', classifierPrediction.crop],
            ['Category', classifierPrediction.category],
            ['Condition candidate', classifierPrediction.condition],
          ] as const).map(([label, prediction]) => <div key={label} className="min-w-0">
            <dt className="text-xs font-medium">{label}</dt>
            <dd className="break-words">{prediction.label.replace(/_/g, ' ')} · {prediction.score.toFixed(2)}%</dd>
          </div>)}
        </dl>}
        {classifierPrediction && <p>These are raw model candidates, not additional confirmed diagnoses. Each DaViT score must reach {CLASSIFIER_MIN_SCORE}%, the crop must match, and image review must agree.{classifierPrediction.cropMasked && ' The condition score is conditional on the predicted crop.'}</p>}
        <p>YOLO11m trained on PlantDoc · 29 leaf categories · server CPU processing: {(evidence.detector.elapsedMs / 1000).toFixed(2)} s.</p>
        {evidence.classifier ? <><p>DaViT-Base · crop, disease and pest classification · server CPU processing: {(evidence.classifier.elapsedMs / 1000).toFixed(2)} s.</p><p>DaViT covers selected leaf, fruit and pest conditions, including Fall Armyworm. It cannot identify every condition and does not measure severity or locate lesions.</p></> : <p>Fruit rot, ear or stem diseases, Fall Armyworm and unlisted crops are outside this leaf detector’s trained scope.</p>}
        {davit && evidence.classifier?.prediction && <p>Crop score: {evidence.classifier.prediction.crop.score.toFixed(2)}% · Category score: {evidence.classifier.prediction.category.score.toFixed(2)}% · Condition score: {evidence.classifier.prediction.condition.score.toFixed(2)}%. The displayed model score is the lowest of these three checks.{evidence.classifier.prediction.cropMasked && ' The disease score is conditional on the predicted crop.'}</p>}
        {!confirmed && <p>A Gemini fallback result is not a diagnosis confirmed by a specialized model. Try a clear close-up of the affected plant part; a wide field photo may not show enough detail.</p>}
        {evidence.reviewReason && <p>Image review: {evidence.reviewReason}</p>}
        {expanded && imageUrl && regions.length > 0 && <>
          <p>Green boxes show detected leaves, not the diseased area.</p>
          <div className="relative mx-auto max-w-xl overflow-hidden rounded-lg">
            {/* Native image dimensions keep normalized overlays aligned without cropping. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Crop photo with model-detected leaf regions" className="block h-auto w-full"/>
            {regions.map((r,i)=><div key={i} aria-hidden="true" className="pointer-events-none absolute border-2 border-emerald-500" style={{top:`${r.box[0]/10}%`,left:`${r.box[1]/10}%`,height:`${(r.box[2]-r.box[0])/10}%`,width:`${(r.box[3]-r.box[1])/10}%`}} />)}
          </div>
        </>}
      </div>
    </CardContent>
  </Card>;
}
