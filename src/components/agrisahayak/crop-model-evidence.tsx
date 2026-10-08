import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {ScanSearch} from 'lucide-react';
import {DETECTOR_SOURCE, DETECTOR_MIN_SCORE, type CropEvidence} from '@/lib/crop-detector';

export default function CropModelEvidence({evidence, imageUrl}: {evidence:CropEvidence; imageUrl?:string}) {
  const confirmed = evidence.route === 'model_assisted' && Boolean(evidence.accepted);
  const regions = confirmed ? evidence.detector.detections.filter(d=>d.score>=DETECTOR_MIN_SCORE) : [];
  return <Card className="border-emerald-200 dark:border-emerald-900">
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg"><ScanSearch className="h-5 w-5"/>How this report was made</CardTitle>
        <Badge variant="outline">{confirmed ? 'YOLO11 + Gemini review' : 'Gemini fallback'}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      <p>{evidence.reason}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">Severity and red symptom circles are Gemini visual estimates. The detector identifies leaf regions; its score is not a measured accuracy or percentage of disease.</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Model details{regions.length ? ' and detected leaf regions' : ''}</summary>
        <div className="mt-3 space-y-2">
          <p>YOLO11m trained on PlantDoc · 29 leaf categories · server CPU processing: {(evidence.detector.elapsedMs / 1000).toFixed(2)} s.</p>
          <p>It does not cover every crop or disease, including Fall Armyworm.</p>
          {evidence.reviewReason && <p>Image review: {evidence.reviewReason}</p>}
          <a href={DETECTOR_SOURCE} target="_blank" rel="noreferrer" className="underline">Model source and pinned version (AGPL-3.0)</a>
          <p><a href="https://github.com/amnakashif01/AgriGuard-copy" target="_blank" rel="noreferrer" className="underline">Application integration source</a></p>
          {imageUrl && regions.length > 0 && <>
            <p>Green boxes show detected leaves, not the diseased area.</p>
            <div className="relative mx-auto max-w-xl overflow-hidden rounded-lg">
              {/* Native dimensions keep the normalized overlay aligned without cropping. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Crop photo with model-detected leaf regions" className="block h-auto w-full"/>
              {regions.map((r,i)=><div key={i} aria-hidden="true" className="pointer-events-none absolute border-2 border-emerald-500" style={{top:`${r.box[0]/10}%`,left:`${r.box[1]/10}%`,height:`${(r.box[2]-r.box[0])/10}%`,width:`${(r.box[3]-r.box[1])/10}%`}} />)}
            </div>
          </>}
        </div>
      </details>
    </CardContent>
  </Card>;
}
