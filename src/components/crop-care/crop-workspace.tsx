"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  ChevronDown,
  History,
  Leaf,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { MyCrop, MyPlant, PlantRecord } from "@/lib/my-crops/models";
import { recordsInCareSeason } from "@/lib/my-crops/record-comparison";
import type {
  CareEvent,
  CarePage,
  CareReport,
  CareSeason,
} from "@/lib/crop-care/models";
import { useCropData } from "@/components/my-crops/shared";
import ReportCare, { CareJourney, HistoricalInsights } from "./report-care";
import {
  Busy,
  date,
  ErrorBox,
  panel,
  primary,
  SeasonForm,
  select,
  useCareApi,
} from "./shared";
const PlantProgressComparison = dynamic(
  () =>
    import("@/components/my-crops/record-comparison").then(
      (m) => m.PlantProgressComparison,
    ),
  { loading: () => <Busy>Opening report comparison…</Busy> },
);
type Detail = {
  season: CareSeason;
  reports: CarePage<CareReport>;
  events: CarePage<CareEvent>;
};

export default function CropWorkspace({
  crop,
  plant,
}: {
  crop: MyCrop;
  plant?: MyPlant;
}) {
  const params = useSearchParams();
  const { api, ready } = useCareApi();
  const records = useCropData<PlantRecord>(
    plant ? `crops/${crop.id}/plants/${plant.id}/records` : null,
    true,
  );
  const [seasons, setSeasons] = useState<CarePage<CareSeason>>({
    items: [],
    nextCursor: null,
  });
  const [seasonId, setSeasonId] = useState(params.get("seasonId") || "");
  const [detail, setDetail] = useState<Detail | null>(null),
    [report, setReport] = useState<CareReport | null>(null);
  const [reportId, setReportId] = useState(""),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [reportLoading, setReportLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false),
    [editOpen, setEditOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [compareOpen, setCompareOpen] = useState(false);
  const [linkReport, setLinkReport] = useState("");
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const fits = useCallback(
    (s: CareSeason) =>
      s.cropId === crop.id && (!plant || !s.plantId || s.plantId === plant.id),
    [crop.id, plant?.id],
  );
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<CarePage<CareSeason>>(
      { resource: "seasons", crop: crop.name },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (controller.signal.aborted) return;
        setSeasons(v);
        const eligible = v.items
          .filter(fits)
          .sort(
            (a, b) =>
              Number(b.status === "active") - Number(a.status === "active") ||
              b.startedOn.localeCompare(a.startedOn),
          );
        setSeasonId((current) => current || eligible[0]?.id || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, ready, crop.name, fits, revision]);
  useEffect(() => {
    if (!ready || !seasonId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    setReport(null);
    setError("");
    api<Detail>(
      { resource: "season-detail", seasonId },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (controller.signal.aborted) return;
        if (!fits(v.season))
          throw new Error("Choose a season belonging to this crop and plant.");
        setDetail(v);
        const available = v.reports.items
          .filter((r) => !plant || r.plantId === plant.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setReportId((current) =>
          available.some((r) => r.id === current)
            ? current
            : available[0]?.id || "",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setReportId("");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [api, ready, seasonId, fits, plant?.id, revision]);
  useEffect(() => {
    setReport(null);
    if (!reportId) return;
    const controller = new AbortController();
    setReportLoading(true);
    api<CareReport>(
      { resource: "report", reportId },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (!controller.signal.aborted) setReport(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportLoading(false);
      });
    return () => controller.abort();
  }, [api, reportId, revision]);
  const options = [
    ...seasons.items.filter(fits),
    ...(detail && !seasons.items.some((s) => s.id === detail.season.id)
      ? [detail.season]
      : []),
  ].sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  const seasonReports = useMemo(
    () =>
      (detail?.reports.items || [])
        .filter((r) => !plant || r.plantId === plant.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [detail?.reports.items, plant?.id],
  );
  const knownIds = useMemo(
    () => new Set(seasonReports.map((r) => r.id)),
    [seasonReports],
  );
  const seasonEvents = detail
    ? {
        ...detail.events,
        items: detail.events.items.filter(
          (e) => !plant || knownIds.has(e.reportId),
        ),
      }
    : { items: [], nextCursor: null };
  const comparisonRecords = records.data.filter((r) =>
    knownIds.has(r.reportId),
  );
  async function more(resource: "seasons" | "reports" | "events") {
    const cursor =
      resource === "seasons"
        ? seasons.nextCursor
        : detail?.[resource].nextCursor;
    if (!cursor || busy) return;
    setBusy(true);
    setError("");
    try {
      if (resource === "seasons") {
        const next = await api<CarePage<CareSeason>>({
          resource,
          crop: crop.name,
          cursor,
        });
        setSeasons((v) => ({ ...next, items: [...v.items, ...next.items] }));
      }
      if (resource === "reports") {
        const next = await api<CarePage<CareReport>>({
          resource,
          seasonId,
          cursor,
        });
        setDetail(
          (v) =>
            v && {
              ...v,
              reports: { ...next, items: [...v.reports.items, ...next.items] },
            },
        );
      }
      if (resource === "events") {
        const next = await api<CarePage<CareEvent>>({
          resource,
          seasonId,
          cursor,
        });
        setDetail(
          (v) =>
            v && {
              ...v,
              events: { ...next, items: [...v.events.items, ...next.items] },
            },
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more records.");
    } finally {
      setBusy(false);
    }
  }
  const newHref = plant
    ? `/my-crops/${crop.id}/${plant.id}/new${seasonId ? `?careSeasonId=${encodeURIComponent(seasonId)}` : ""}`
    : `/report/new?crop=${encodeURIComponent(crop.name)}${seasonId ? `&careSeasonId=${encodeURIComponent(seasonId)}` : ""}`;
  function chooseSeason(id: string) {
    setSeasonId(id);
    setReportId("");
    setCompareOpen(false);
    setHistoryOpen(false);
    setNotice("");
  }
  const moreSeasons = seasons.nextCursor && (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => more("seasons")}
    >
      {busy ? "Loading…" : "Load more seasons"}
    </Button>
  );
  return (
    <div className="min-w-0 space-y-5" aria-label="Crop reports and care">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Label htmlFor="workspace-season">Season / crop cycle</Label>
          <select
            id="workspace-season"
            className={select + " mt-2"}
            value={seasonId}
            onChange={(e) => chooseSeason(e.target.value)}
          >
            <option value="">Choose a growing season</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.field} · {s.label} ·{" "}
                {s.status === "completed" ? "Harvested" : "Growing"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh crop care"
            onClick={refresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            New season
          </Button>
          {(!detail || detail.season.status === "active") && (
            <Button asChild className={primary}>
              <Link href={newHref}>
                <Plus className="mr-2 h-4 w-4" />
                New report
              </Link>
            </Button>
          )}
        </div>
      </header>
      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {loading && !detail && <Busy>Loading your crop seasons…</Busy>}
      {!loading && !seasonId && (
        <section className={panel}>
          <Leaf className="mb-3 h-7 w-7 text-emerald-700" />
          <h2 className="text-lg font-semibold text-emerald-950">
            Keep this crop’s reports and care together
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Create a season for this planting, or open a saved report to add it
            to an existing season. Earlier records stay saved.
          </p>
          <Button
            className={primary + " mt-4"}
            onClick={() => setCreateOpen(true)}
          >
            Create first season
          </Button>
          <div className="mt-3">{moreSeasons}</div>
        </section>
      )}
      {detailLoading && <Busy>Opening this crop cycle…</Busy>}
      {detail && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-500">
              {date(detail.season.startedOn)} –{" "}
              {detail.season.endedOn ? date(detail.season.endedOn) : "Growing"}{" "}
              ·{" "}
              {detail.season.status === "completed"
                ? "Harvested crop cycle"
                : "Current crop cycle"}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
              Edit / finish season
            </Button>
          </div>
          {seasonReports.length > 0 ? (
            <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="workspace-report"
                  className="text-xs text-emerald-800"
                >
                  Report for this season
                </Label>
                <select
                  id="workspace-report"
                  className={select + " mt-1"}
                  value={reportId}
                  onChange={(e) => setReportId(e.target.value)}
                >
                  {seasonReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {date(r.createdAt)} · {r.disease}
                    </option>
                  ))}
                </select>
              </div>
              {reportId && (
                <Button variant="link" asChild>
                  <Link href={`/report/${reportId}`}>
                    View report & AI care{" "}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </section>
          ) : (
            <section className={panel}>
              <h3 className="font-semibold">No reports linked here yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Open a saved report and choose this season, or create a new
                diagnosis.
              </p>
              <Link
                className="mt-3 inline-block text-sm font-medium text-emerald-800 underline"
                href="/dashboard"
              >
                Open saved reports
              </Link>
            </section>
          )}
          {detail.reports.nextCursor && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => more("reports")}
            >
              Load more reports in this season
            </Button>
          )}
          {reportLoading && <Busy>Opening saved report details…</Busy>}
          {report && report.careSeasonId === seasonId && (
            <>
              <HistoricalInsights
                key={report.id + ":" + revision}
                reportId={report.id}
                api={api}
              />
              <CareJourney
                key={report.id + seasonId}
                report={report}
                season={detail.season}
                events={seasonEvents}
                api={api}
                readOnly={false}
                reports={seasonReports}
                onChanged={() => {
                  setNotice("Care entry saved.");
                  refresh();
                }}
                onMore={() => more("events")}
                moreBusy={busy}
              />
            </>
          )}
          <section className={panel}>
            <button
              type="button"
              aria-expanded={compareOpen}
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setCompareOpen((v) => !v)}
            >
              <span>
                <span className="block font-semibold text-emerald-950">
                  Compare reports from this season
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Same plant / plot, different checks.
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 ${compareOpen ? "rotate-180" : ""}`}
              />
            </button>
            {compareOpen && (
              <div className="mt-5">
                {plant ? (
                  records.loading ? (
                    <Busy>Loading this plant’s reports…</Busy>
                  ) : records.error ? (
                    <ErrorBox>{records.error}</ErrorBox>
                  ) : (
                    <PlantProgressComparison
                      key={seasonId + plant.id}
                      records={comparisonRecords}
                      cropId={crop.id}
                      plantId={plant.id}
                    />
                  )
                ) : (
                  <p className="text-sm text-slate-500">
                    Choose a named plant above to compare checks of the same
                    plant. Field-wide reports remain available in the report
                    selector.
                  </p>
                )}
                {detail.reports.nextCursor && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => more("reports")}
                  >
                    Load more reports for comparison
                  </Button>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {plant && records.data.length > 0 && (
        <details className={panel + " group"}>
          <summary className="flex cursor-pointer list-none justify-between gap-3 font-semibold text-emerald-950">
            All saved reports for {plant.name}
            <ChevronDown className="h-4 w-4 group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Open any report to assign its correct season. Dates alone do not
            assign a crop cycle.
          </p>
          <ul className="mt-4 space-y-2">
            {[...records.data].reverse().map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 p-3"
              >
                <span className="min-w-0 break-words text-sm">
                  {date(r.createdAt)} · {r.diagnosis?.disease || r.status}
                </span>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="link">
                    <Link
                      href={`/report/${r.reportId}${seasonId ? `?careSeasonId=${seasonId}` : ""}`}
                    >
                      Open report
                    </Link>
                  </Button>
                  {r.status === "Complete" && !knownIds.has(r.reportId) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLinkReport(r.reportId)}
                    >
                      Choose season
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-emerald-950">
              <History className="h-5 w-5" />
              All past seasons
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Earlier plantings stay separate.
            </p>
          </div>
          <Button variant="link" onClick={() => setHistoryOpen(true)}>
            View history <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </section>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Start a growing season</DialogTitle>
            <DialogDescription>
              Each new planting gets its own care record.
            </DialogDescription>
          </DialogHeader>
          <SeasonForm
            crop={crop.name}
            cropId={crop.id}
            plantId={plant?.id}
            field={plant?.name || ""}
            api={api}
            onCancel={() => setCreateOpen(false)}
            onSave={(id) => {
              setCreateOpen(false);
              chooseSeason(id);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit / finish season</DialogTitle>
            <DialogDescription>
              Keep the dates of this planting. Start a new season for a new crop
              cycle.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <SeasonForm
              key={detail.season.version}
              initial={detail.season}
              api={api}
              onCancel={() => setEditOpen(false)}
              onSave={() => {
                setEditOpen(false);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{crop.name} · All seasons</DialogTitle>
            <DialogDescription>
              Open a previous cycle to see its saved reports and care diary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {options.map((s) => (
              <button
                key={s.id}
                className="w-full rounded-xl border border-emerald-100 p-4 text-left hover:bg-emerald-50"
                onClick={() => chooseSeason(s.id)}
              >
                <strong className="block text-sm">
                  {s.field} · {s.label}
                </strong>
                <span className="mt-1 block text-xs text-slate-500">
                  {date(s.startedOn)} ·{" "}
                  {s.status === "completed" ? "Harvested" : "Growing"}
                </span>
              </button>
            ))}
            {!options.length && (
              <p className="text-sm text-slate-500">No seasons loaded yet.</p>
            )}
            {moreSeasons}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(linkReport)}
        onOpenChange={(v) => {
          if (!v) {
            setLinkReport("");
            refresh();
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add saved report to a season</DialogTitle>
            <DialogDescription>
              Select the planting this report belongs to.
            </DialogDescription>
          </DialogHeader>
          {linkReport && (
            <ReportCare
              reportId={linkReport}
              preferredSeasonId={seasonId}
              compact
              onLinked={(id) => {
                if (id && id !== seasonId) setSeasonId(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
