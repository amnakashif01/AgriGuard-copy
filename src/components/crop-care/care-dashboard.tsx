"use client";
import { outcomeText } from "@/lib/crop-care/display";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  Leaf,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CarePage,
  CareSeason,
  CareReport,
  CareEvent,
} from "@/lib/crop-care/models";
import ReportCare from "./report-care";
import {
  Busy,
  CareTimeline,
  date,
  ErrorBox,
  panel,
  primary,
  SeasonForm,
  select,
  useCareApi,
  type CareApi,
  type Scope,
} from "./shared";
type Detail = {
  season: CareSeason;
  reports: CarePage<CareReport>;
  events: CarePage<CareEvent>;
};
export default function CareDashboard({
  crop = "",
  cropId,
  initialSeasonId = "",
  scope = {},
}: {
  crop?: string;
  cropId?: string;
  initialSeasonId?: string;
  scope?: Scope;
}) {
  const { api, ready, readOnly } = useCareApi(scope);
  const [seasons, setSeasons] = useState<CarePage<CareSeason>>({
      items: [],
      nextCursor: null,
    }),
    [seasonId, setSeasonId] = useState(initialSeasonId),
    [detail, setDetail] = useState<Detail | null>(null),
    [reportId, setReportId] = useState(""),
    [tab, setTab] = useState<"journey" | "compare">("journey"),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [createOpen, setCreateOpen] = useState(false),
    [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<CarePage<CareSeason>>(
      { resource: "seasons", ...(crop ? { crop } : {}) },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (controller.signal.aborted) return;
        setSeasons(v);
        setSeasonId((current) => current || v.items[0]?.id || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setDetail(null);
          setReportId("");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, ready, crop, revision]);
  useEffect(() => {
    if (!ready || !seasonId) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setError("");
    api<Detail>(
      { resource: "season-detail", seasonId },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (!controller.signal.aborted) setDetail(v);
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
  }, [api, ready, seasonId, revision]);
  useEffect(() => {
    if (scope.mode !== "community") return;
    const id = setInterval(() => setRevision((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, [scope.mode]);
  const allSeasons =
    detail && !seasons.items.some((s) => s.id === detail.season.id)
      ? [detail.season, ...seasons.items]
      : seasons.items;
  const sortedSeasons = [...allSeasons].sort((a, b) =>
    b.startedOn.localeCompare(a.startedOn),
  );
  async function more(resource: "seasons" | "reports" | "events") {
    const state = resource === "seasons" ? seasons : detail?.[resource];
    if (!state?.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      if (resource === "seasons") {
        const next = await api<CarePage<CareSeason>>({
          resource,
          cursor: state.nextCursor,
          ...(crop ? { crop } : {}),
        });
        setSeasons({ ...next, items: [...seasons.items, ...next.items] });
      } else if (detail) {
        const next = await api<CarePage<any>>({
          resource,
          seasonId,
          cursor: state.nextCursor,
        });
        setDetail({
          ...detail,
          [resource]: {
            ...next,
            items: [...detail[resource].items, ...next.items],
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            {readOnly ? "Shared crop journey" : "My Crops"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-emerald-950">
            {crop ? crop + " — " : ""}Health & Care History
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            See each season, its reports, what you used, and how your crop
            changed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((v) => v + 1)}
            aria-label="Refresh seasons"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <Button className={primary} onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New season
            </Button>
          )}
        </div>
      </header>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && <Busy>Loading crop seasons…</Busy>}
      {!loading && !error && !seasons.items.length && !detail && (
        <div className={panel + " py-10 text-center"}>
          <Leaf className="mx-auto h-10 w-10 text-emerald-600" />
          <h3 className="mt-4 text-lg font-semibold">
            Start your crop history
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
            Start a season for your crop. Add new reports or choose from your
            saved reports.
          </p>
          {!readOnly && (
            <Button
              className={"mt-5 " + primary}
              onClick={() => setCreateOpen(true)}
            >
              Start first season
            </Button>
          )}
        </div>
      )}
      {allSeasons.length > 0 && (
        <>
          <div className={panel}>
            <Label htmlFor="care-season-picker">Crop · field · season</Label>
            <select
              id="care-season-picker"
              className={select + " mt-2"}
              value={seasonId}
              onChange={(e) => {
                setSeasonId(e.target.value);
                setReportId("");
              }}
            >
              {sortedSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.crop} · {s.field} · {s.label} ·{" "}
                  {s.status === "completed" ? "Harvested" : "Growing"}
                </option>
              ))}
            </select>
            {seasons.nextCursor && (
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => more("seasons")}
              >
                Show more seasons
              </Button>
            )}
          </div>
          <div
            className="flex gap-2"
            role="tablist"
            aria-label="Crop care views"
          >
            <button
              role="tab"
              aria-selected={tab === "journey"}
              onClick={() => setTab("journey")}
              className={`rounded-lg px-4 py-3 text-sm font-medium ${tab === "journey" ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}
            >
              Health & Care
            </button>
            <button
              role="tab"
              aria-selected={tab === "compare"}
              onClick={() => setTab("compare")}
              className={`rounded-lg px-4 py-3 text-sm font-medium ${tab === "compare" ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}
            >
              Compare seasons
            </button>
          </div>
        </>
      )}
      {detailLoading && <Busy>Opening this season…</Busy>}
      {!error && detail && tab === "journey" && (
        <>
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-emerald-950">
                  {detail.season.crop} · {detail.season.label}
                </h3>
                <p className="mt-1 text-sm text-emerald-800">
                  {detail.season.field}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  <CalendarDays className="mr-1 inline h-4 w-4" />
                  {date(detail.season.startedOn)} –{" "}
                  {detail.season.endedOn
                    ? date(detail.season.endedOn)
                    : "Growing"}{" "}
                  ·{" "}
                  {detail.season.status === "completed"
                    ? "Harvested or finished"
                    : "Growing now"}
                </p>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    Edit season or mark harvested
                  </Button>
                  {scope.mode !== "owner" &&
                    detail.season.status === "active" && (
                      <Button asChild size="sm" className={primary}>
                        <Link
                          href={
                            "/report/new?careSeasonId=" +
                            seasonId +
                            "&crop=" +
                            encodeURIComponent(detail.season.crop)
                          }
                        >
                          New report for this season
                        </Link>
                      </Button>
                    )}
                </div>
              )}
            </div>
          </section>
          {reportId ? (
            <section className="space-y-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReportId("");
                  setRevision((v) => v + 1);
                }}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to season history
              </Button>
              <ReportCare
                key={reportId}
                reportId={reportId}
                scope={scope}
                showLink={false}
                onOpen={setReportId}
                reports={detail.reports.items}
              />
            </section>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <section className={panel}>
                <h3 className="flex items-center gap-2 font-semibold">
                  <FileText className="h-5 w-5 text-emerald-700" />
                  Crop reports
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {detail.reports.items.length} reports in this season
                </p>
                <div className="mt-4 space-y-3">
                  {!detail.reports.items.length && (
                    <p className="text-sm text-slate-500">
                      No reports here yet. Open a saved report and choose this
                      season.
                    </p>
                  )}
                  {[...detail.reports.items]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setReportId(r.id)}
                        className="w-full rounded-xl border border-slate-100 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        <span className="block text-xs text-slate-500">
                          {date(r.createdAt)}
                        </span>
                        <strong className="mt-1 block text-sm">
                          {r.disease || "Report not ready yet"}
                        </strong>
                        <span className="mt-2 inline-block text-xs text-emerald-800">
                          Open report & care →
                        </span>
                      </button>
                    ))}
                </div>
                {detail.reports.nextCursor && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    disabled={busy}
                    onClick={() => more("reports")}
                  >
                    Load more reports
                  </Button>
                )}
              </section>
              <div className="space-y-3">
                <CareTimeline
                  key={seasonId + ":" + revision}
                  events={detail.events.items}
                  seasonId={seasonId}
                  api={api}
                  readOnly={readOnly}
                  onChanged={() => setRevision((v) => v + 1)}
                />
                {detail.events.nextCursor && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => more("events")}
                  >
                    Show more care history
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {!error && tab === "compare" && allSeasons.length > 0 && (
        <SeasonComparison
          seasons={sortedSeasons}
          currentId={seasonId}
          api={api}
          onChoose={(id) => {
            setSeasonId(id);
            setTab("journey");
            setReportId("");
          }}
        />
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Start a crop season</DialogTitle>
            <DialogDescription>
              Start a new season when you plant again. Older seasons stay saved.
            </DialogDescription>
          </DialogHeader>
          <SeasonForm
            key={createOpen ? "create" : "closed"}
            crop={crop}
            cropId={cropId}
            api={api}
            onCancel={() => setCreateOpen(false)}
            onSave={(id) => {
              setCreateOpen(false);
              setSeasonId(id);
              setReportId("");
              setRevision((v) => v + 1);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit or finish this season</DialogTitle>
            <DialogDescription>
              Mark this season as finished after harvest. Start a new season for
              the next crop.
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
                setRevision((v) => v + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function SeasonComparison({
  seasons,
  currentId,
  api,
  onChoose,
}: {
  seasons: CareSeason[];
  currentId: string;
  api: CareApi;
  onChoose: (id: string) => void;
}) {
  const current = seasons.find((s) => s.id === currentId) || seasons[0],
    eligible = seasons.filter((s) => s.cropKey === current.cropKey);
  const [left, setLeft] = useState(
      eligible.find((s) => s.id !== current.id)?.id || "",
    ),
    [right, setRight] = useState(current.id),
    [rows, setRows] = useState<Detail[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRight(current.id);
    setLeft(eligible.find((s) => s.id !== current.id)?.id || "");
  }, [current.id]);
  useEffect(() => {
    if (!left || !right || left === right) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setRows([]);
    Promise.all(
      [left, right].map((seasonId) =>
        api<Detail>(
          { resource: "season-detail", seasonId },
          undefined,
          controller.signal,
        ),
      ),
    )
      .then((v) => {
        if (!controller.signal.aborted) setRows(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, left, right]);
  return (
    <section className="space-y-4">
      <div className={panel}>
        <h3 className="text-lg font-semibold">Compare seasons</h3>
        <p className="mt-1 text-sm text-slate-500">
          Compare two separate seasons: their problems, treatments and crop
          updates.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            { id: "before", value: left, set: setLeft },
            { id: "after", value: right, set: setRight },
          ].map((v, i) => (
            <div key={v.id}>
              <Label htmlFor={"compare-" + v.id}>
                {i ? "Second season" : "First season"}
              </Label>
              <select
                id={"compare-" + v.id}
                className={select}
                value={v.value}
                onChange={(e) => v.set(e.target.value)}
              >
                <option value="">Choose a season</option>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.field}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {eligible.length < 2 && (
          <p className="mt-3 text-sm text-slate-500">
            Add a season when you plant again. You can also add older reports to
            the right season.
          </p>
        )}
        {left === right && left && (
          <p className="mt-3 text-sm text-amber-800">
            Choose two different seasons.
          </p>
        )}
      </div>
      {busy && <Busy>Loading saved season records…</Busy>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((d) => (
          <article key={d.season.id} className={panel}>
            <h4 className="text-xl font-semibold text-emerald-950">
              {d.season.crop} · {d.season.label}
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              {d.season.field} ·{" "}
              {d.season.status === "completed" ? "Harvested" : "Growing"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {date(d.season.startedOn)} –{" "}
              {d.season.endedOn ? date(d.season.endedOn) : "Active"}
            </p>
            <h5 className="mt-5 text-sm font-semibold">Problems found</h5>
            {d.reports.items.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {[...new Set(d.reports.items.map((r) => r.disease))].map(
                  (v) => (
                    <li key={v}>{v}</li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No reports saved.</p>
            )}
            <h5 className="mt-5 text-sm font-semibold">What you used or did</h5>
            <p className="mt-2 text-sm text-slate-600">
              {d.events.items
                .filter((e) => e.kind === "applied" && !e.voidedAt)
                .map((e) => e.product)
                .join(" · ") || "No treatment recorded"}
            </p>
            <h5 className="mt-5 text-sm font-semibold">How the crop changed</h5>
            <p className="mt-2 text-sm text-slate-600">
              {[
                ...new Set(
                  d.events.items
                    .filter((e) => e.kind === "followup" && !e.voidedAt)
                    .map((e) => outcomeText(e.outcome)),
                ),
              ].join(" · ") || "No update saved"}
            </p>
            {(d.reports.nextCursor || d.events.nextCursor) && (
              <p className="mt-3 text-xs text-amber-800">
                More records are available. Open the season to see them.
              </p>
            )}
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => onChoose(d.season.id)}
            >
              Open season history
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
