"use client";
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CareReport } from "@/lib/crop-care/models";
import {
  cropDamageChange,
  earlierCareReports,
} from "@/lib/crop-care/report-photos";
import { Busy, date, ErrorBox, select, type CareApi } from "./shared";

function ReportPhoto({ report, title }: { report: CareReport; title: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h4 className="font-semibold text-emerald-950">{title}</h4>
        <span className="text-xs text-slate-500">{date(report.createdAt)}</span>
      </div>
      <Link
        href={`/report/${report.id}`}
        className="flex aspect-[16/10] max-h-80 w-full items-center justify-center bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        aria-label={`Open ${title.toLowerCase()} from ${date(report.createdAt)}`}
      >
        {report.image && !failed ? (
          <img
            src={report.image}
            alt={`${report.crop} photo tested on ${date(report.createdAt)}`}
            width={640}
            height={400}
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-slate-500">
            <ImageOff className="h-7 w-7" />
            No photo saved for this report
          </span>
        )}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="break-words font-semibold text-emerald-950">
            {report.disease || report.status}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {report.severity
              ? `Damage level: ${report.severity}`
              : "Saved result"}
          </p>
        </div>
        <Button asChild size="sm" variant="link">
          <Link href={`/report/${report.id}`}>
            View report
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function ReportPhotos({
  report,
  reports,
  api,
  latestKnown,
}: {
  report: CareReport;
  reports: CareReport[];
  api: CareApi;
  latestKnown: boolean;
}) {
  const id = useId();
  const earlier = useMemo(
    () => earlierCareReports(reports, report),
    [reports, report],
  );
  const [choice, setChoice] = useState("");
  const previousId = earlier.some((r) => r.id === choice)
    ? choice
    : earlier[0]?.id || "";
  const [previous, setPrevious] = useState<CareReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setPrevious(null);
    setError("");
    if (!previousId) return;
    const controller = new AbortController();
    api<CareReport>(
      { resource: "report", reportId: previousId },
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setPrevious(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load the earlier photo.",
          );
      });
    return () => controller.abort();
  }, [api, previousId, retry]);
  // A report can be relinked while open. Never pair it outside its saved cycle.
  const validPrevious =
    previous?.id === previousId && earlierCareReports([previous], report).length
      ? previous
      : null;
  const damageChange = validPrevious
    ? cropDamageChange(validPrevious, report)
    : null;
  return (
    <section aria-label="Your tested report photos" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-emerald-950">
            Your crop’s progress
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Photos from the same crop and season.
          </p>
        </div>
        {earlier.length > 0 && (
          <div className="min-w-0 sm:max-w-xs">
            <Label htmlFor={id} className="text-xs">
              Choose an earlier report
            </Label>
            <select
              id={id}
              className={select + " mt-1"}
              value={previousId}
              onChange={(e) => setChoice(e.target.value)}
            >
              {earlier.map((r) => (
                <option key={r.id} value={r.id}>
                  {date(r.createdAt)} · {r.disease}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className={`grid gap-4 ${previousId ? "sm:grid-cols-2" : ""}`}>
        {previousId &&
          (validPrevious ? (
            <ReportPhoto
              key={validPrevious.id}
              report={validPrevious}
              title="Earlier report"
            />
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-2xl border border-emerald-100 p-5">
              {error ? (
                <div>
                  <ErrorBox>{error}</ErrorBox>
                  <Button
                    variant="outline"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    Retry photo
                  </Button>
                </div>
              ) : previous ? (
                <p className="text-sm text-slate-500">
                  This report is now in another season. Refresh the page.
                </p>
              ) : (
                <Busy>Opening earlier photo…</Busy>
              )}
            </div>
          ))}
        <ReportPhoto
          key={report.id}
          report={report}
          title={latestKnown ? "Latest report" : "Selected report"}
        />
      </div>
      {validPrevious ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${damageChange?.direction === "higher" ? "border-orange-200 bg-orange-50 text-orange-950" : damageChange?.direction === "lower" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-800"}`}
        >
          <strong className="block">
            {damageChange?.message || "Your saved report comparison"}
          </strong>
          {damageChange && (
            <span className="mt-1 block">
              Before: {validPrevious.severity} → Now: {report.severity}
            </span>
          )}
          <span className="mt-1 block text-xs">
            {validPrevious.disease} → {report.disease}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Based on saved reports. Photos alone cannot show whether a treatment
            worked.
          </span>
        </p>
      ) : !previousId ? (
        <p className="text-xs text-slate-500">
          Add another report this season to compare photos.
        </p>
      ) : null}
    </section>
  );
}
