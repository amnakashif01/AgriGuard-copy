import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlaskConical } from 'lucide-react';
import type { PlantModelAssessment as Assessment } from '@/lib/plant-model';

export default function PlantModelAssessment({ assessment }: { assessment: Assessment }) {
  const top = assessment.predictions[0];
  const confirmed = Boolean(top && assessment.review === 'agreed');
  const reviewLabels = { agreed: 'Image review agrees', uncertain: 'Needs confirmation', disagreed: 'Image review differs', not_applicable: 'Outside model coverage', unavailable: 'Model unavailable' };
  return <Card className="border-emerald-200 dark:border-emerald-900">
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg"><FlaskConical className="h-5 w-5" />Crop model analysis</CardTitle>
        <Badge variant="outline">{confirmed ? 'MobileNetV2 + Gemini review' : 'Gemini assessment'}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {confirmed && top && <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">MobileNetV2 prediction</p><p className="font-semibold">{top.label}</p></div>
        <div><p className="text-sm text-muted-foreground">Model score</p><p className="font-semibold">{top.score.toFixed(1)}%</p></div>
      </div>}
      {assessment.review && <p className="text-sm font-medium">{reviewLabels[assessment.review]}</p>}
      {!confirmed && <p className="text-sm">The specialized model did not confirm this diagnosis. The report uses Gemini’s image assessment.</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">{assessment.note}</p>
      {top && <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Model details and other predictions</summary>
        <div className="mt-2 space-y-1">
          {!confirmed && <p>Unconfirmed candidate (not used as the diagnosis): {top.label}, {top.score.toFixed(1)}%</p>}
          {assessment.reviewReason && <p>{assessment.reviewReason}</p>}
          {assessment.predictions.slice(1).map(p => <p key={p.label}>{p.label}: {p.score.toFixed(1)}%</p>)}
          <p>Server CPU processing: {assessment.elapsedMs} ms. Trained model by linkanjarad; ONNX conversion by ONNX Community.</p>
          <a className="underline break-all" href={`https://huggingface.co/${assessment.model}/tree/${assessment.revision}`} target="_blank" rel="noreferrer">View model and pinned version</a>
        </div>
      </details>}
    </CardContent>
  </Card>;
}
