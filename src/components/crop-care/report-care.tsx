"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  History,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  Sprout,
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
  CareEvent,
  CarePage,
  CareReport,
  CareSeason,
  HistoryResult,
  HistoricalMatch,
} from "@/lib/crop-care/models";
import {
  careDay,
  latestOutcome,
  reportFitsSeason,
} from "@/lib/crop-care/models";
import {
  Busy,
  CareTimeline,
  date,
  ErrorBox,
  EventComposer,
  panel,
  primary,
  SeasonForm,
  select,
  today,
  useCareApi,
  type CareApi,
  type Scope,
} from "./shared";

export function careRecordHref(season: CareSeason) {
  const base = season.cropId
    ? `/my-crops/${encodeURIComponent(season.cropId)}${season.plantId ? `/${encodeURIComponent(season.plantId)}` : ""}`
    : "/my-crops/health";
  return `${base}?seasonId=${encodeURIComponent(season.id)}`;
}

function HistoryMatch({
  match: m,
  onOpen,
  summary = false,
}: {
  match: HistoricalMatch;
  onOpen?: (id: string) => void;
  summary?: boolean;
}) {
  const treatments = m.treatments.filter(
    (e) => e.kind === "applied" && !e.voidedAt,
  );
  const shown = summary ? treatments.slice(-1) : treatments;
  return (
    <article className="min-w-0 rounded-xl border border-emerald-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-emerald-950">
            {m.season?.label || "Season not assigned"}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {date(m.report.createdAt)}
            {m.season
              ? ` · ${m.season.status === "completed" ? "Harvested crop cycle" : "Separate crop cycle"}`
              : " · Planting not confirmed"}
          </p>
        </div>
        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          {m.match === "same" ? "Same saved diagnosis" : "Similar / uncertain"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Earlier issue</p>
          <p className="mt-1 break-words text-sm font-medium">
            {m.report.disease}
          </p>
        </div>
        <div className="sm:col-span-2">
          {shown.length ? (
            shown.map((e) => {
              const outcome = m.moreCareAvailable
                ? undefined
                : latestOutcome(m.treatments, e.id);
              return (
                <div key={e.id} className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">You recorded using</p>
                    <p className="mt-1 break-words text-sm font-medium">
                      {e.product}
                    </p>
                    {!summary && (
                      <p className="mt-1 text-xs text-slate-500">
                        {date(e.occurredOn)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Your follow-up</p>
                    <p className="mt-1 text-sm font-medium text-emerald-800">
                      {outcome?.outcome ||
                        (m.moreCareAvailable
                          ? "Open full record"
                          : "Not recorded")}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-500">
              No actual treatment was recorded.
            </p>
          )}
        </div>
      </div>
      {!summary && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {m.explanation}
          {m.fieldRelation === "different" ? " Different growing area." : ""}
          {m.moreCareAvailable
            ? " More care entries are available in the saved report."
            : ""}
        </p>
      )}
      {onOpen ? (
        <Button variant="link" size="sm" onClick={() => onOpen(m.report.id)}>
          Open past record <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      ) : (
        <Link
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-800 underline"
          href={`/report/${m.report.id}`}
        >
          Open past record <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </article>
  );
}

export function HistoricalInsights({
  reportId,
  api,
  onOpen,
}: {
  reportId: string;
  api: CareApi;
  onOpen?: (id: string) => void;
}) {
  const [data, setData] = useState<HistoryResult | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setBusy(true);
    api<HistoryResult>(
      { resource: "history", reportId },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (!controller.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, reportId]);
  async function more() {
    if (!data?.nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<HistoryResult>({
        resource: "history",
        reportId,
        cursor: data.nextCursor,
      });
      setData({
        ...next,
        matches: [...data.matches, ...next.matches].filter(
          (m, i, a) => a.findIndex((x) => x.report.id === m.report.id) === i,
        ),
        previousCount: data.previousCount + next.previousCount,
        unassignedCount: data.unassignedCount + next.unassignedCount,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setBusy(false);
    }
  }
  const matches = [...(data?.matches || [])].sort((a, b) =>
    b.report.createdAt.localeCompare(a.report.createdAt),
  );
  const known = matches.find((m) => m.season);
  const first = known || matches[0];
  const loadMore = data?.nextCursor ? (
    <Button type="button" variant="outline" disabled={busy} onClick={more}>
      {busy ? "Loading…" : "Check more history across all years"}
    </Button>
  ) : null;
  return (
    <>
      <section
        aria-label="Earlier crop history"
        className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5"
      >
        <h3 className="flex items-center gap-2 font-semibold text-emerald-950">
          <History className="h-5 w-5 shrink-0" />
          {known
            ? "Found in an earlier season"
            : first
              ? "Similar earlier record"
              : "Your past crop records"}
        </h3>
        {busy && !data && <Busy>Checking your saved crop history…</Busy>}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        {data && (
          <div className="mt-3 space-y-3">
            {first ? (
              <HistoryMatch match={first} summary onOpen={onOpen} />
            ) : (
              <p className="text-sm text-slate-600">
                {data.nextCursor
                  ? "No match in the records checked so far. Check more history below."
                  : data.previousCount
                    ? "No matching disease or pest found in the earlier records checked."
                    : "No earlier record found for this crop yet."}
              </p>
            )}
            {first && (
              <p className="text-xs leading-5 text-slate-500">
                Past treatment and improvement are your saved observations. They
                do not automatically become today’s recommendation.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(matches.length > 0 || data.unassignedCount > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(true)}
                >
                  View past records
                  {matches.length > 1 ? ` (${matches.length})` : ""}
                </Button>
              )}
              {loadMore}
            </div>
          </div>
        )}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Past seasons & crop records</DialogTitle>
            <DialogDescription>
              Earlier crop cycles stay separate from this season. Matches use
              saved diagnosis labels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {matches.map((m) => (
              <HistoryMatch key={m.report.id} match={m} onOpen={onOpen} />
            ))}
            {Boolean(data?.unassignedCount) && (
              <p className="text-xs text-slate-500">
                {data?.unassignedCount} earlier reports have no assigned season.
                Their dates alone do not establish a planting.
              </p>
            )}
            {loadMore}
            {error && <ErrorBox>{error}</ErrorBox>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CareJourney({
  report,
  season,
  events,
  api,
  readOnly,
  reports = [],
  onChanged,
  onMore,
  moreBusy = false,
}: {
  report: CareReport;
  season: CareSeason;
  events: CarePage<CareEvent>;
  api: CareApi;
  readOnly: boolean;
  reports?: CareReport[];
  onChanged: () => void;
  onMore?: () => void;
  moreBusy?: boolean;
}) {
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [followupTreatmentId, setFollowupTreatmentId] = useState("");
  const [followup, setFollowup] = useState<CareEvent["outcome"] | null>(null);
  const [stepIndex, setStepIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const step = report.plan?.steps[stepIndex];
  const planned = events.items.some(
    (e) =>
      e.reportId === report.id &&
      e.kind === "planned" &&
      !e.voidedAt &&
      e.suggestion?.title === step?.title,
  );
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const applied = events.items
    .filter((e) => e.kind === "applied" && !e.voidedAt)
    .sort(
      (a, b) =>
        b.occurredOn.localeCompare(a.occurredOn) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const latest = applied[0];
  const observation = latest ? latestOutcome(events.items, latest.id) : null;
  async function plan() {
    if (busy || !step) return;
    setBusy(true);
    setError("");
    try {
      await api(
        {},
        {
          action: "event.add",
          requestId: requestId.current,
          seasonId: season.id,
          reportId: report.id,
          kind: "planned",
          product: "",
          category: "other",
          occurredOn: today(),
          notes: "",
          outcome: "Not yet checked",
          stepIndex,
        },
      );
      requestId.current = crypto.randomUUID();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the plan.");
    } finally {
      setBusy(false);
    }
  }
  const more =
    events.nextCursor && onMore ? (
      <Button variant="outline" size="sm" disabled={moreBusy} onClick={onMore}>
        {moreBusy ? "Loading…" : "Load more care entries"}
      </Button>
    ) : null;
  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Care for this crop">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-950">
            <Sprout className="h-5 w-5" />
            Care for this crop
          </h3>
          <Button size="sm" variant="ghost" onClick={() => setDiaryOpen(true)}>
            View care history
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <h4 className="font-semibold text-emerald-950">
              AI suggested care
            </h4>
            <p className="mb-3 mt-1 text-xs text-slate-500">
              Recommended in this report.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPlanOpen(true)}
            >
              View care plan
            </Button>
          </div>
          <div className="rounded-xl border border-emerald-100 p-4">
            <h4 className="font-semibold text-emerald-950">What I used</h4>
            <p className="mb-3 mt-1 text-xs text-slate-500">
              Save what you actually applied or did.
            </p>
            {!readOnly ? (
              <Button
                className={primary + " w-full"}
                onClick={() => setTreatmentOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add treatment
              </Button>
            ) : (
              <p className="text-sm text-slate-600">
                Shared treatments appear below.
              </p>
            )}
          </div>
        </div>
        {latest ? (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {events.nextCursor
                    ? "Saved treatment"
                    : "Most recent saved treatment"}
                </p>
                <p className="mt-1 break-words font-semibold text-emerald-950">
                  {latest.product}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Used {date(latest.occurredOn)}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
                Actually used
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {observation
                ? `Your update: ${observation.outcome} · ${date(observation.occurredOn)}`
                : "No condition update saved yet."}
            </p>
            {!readOnly && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-sm font-medium">
                  How is your crop now?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Better", "Improved"],
                      ["Same", "No change"],
                      ["Worse", "Worsened"],
                    ] as const
                  ).map(([label, value]) => (
                    <Button
                      key={value}
                      variant="outline"
                      className="px-2"
                      onClick={() => {
                        setFollowupTreatmentId(latest.id);
                        setFollowup(value);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Your observation after this treatment.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No treatment recorded yet. Add one when you use a product or care
            for this crop.
          </p>
        )}
      </section>
      <Dialog open={treatmentOpen} onOpenChange={setTreatmentOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What did you use?</DialogTitle>
            <DialogDescription>
              {season.crop} · {season.field} · {season.label}. Linked to this
              report automatically.
            </DialogDescription>
          </DialogHeader>
          <EventComposer
            simple
            compact
            report={report}
            season={season}
            events={events.items}
            api={api}
            reports={reports}
            onSaved={() => {
              setTreatmentOpen(false);
              onChanged();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>AI suggested care</DialogTitle>
            <DialogDescription>
              Care plan from the selected report.
            </DialogDescription>
          </DialogHeader>
          <p className="mt-3 text-xs text-slate-500">
            From this diagnosis report. Suggestions are separate from treatments
            actually used.
          </p>
          {report.plan?.steps.length ? (
            <div className="mt-4 space-y-3">
              <Label htmlFor="care-step">Suggested care step</Label>
              <select
                id="care-step"
                className={select}
                value={stepIndex}
                onChange={(e) => setStepIndex(Number(e.target.value))}
              >
                {report.plan.steps.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {s.title}
                  </option>
                ))}
              </select>
              {step && (
                <div className="space-y-2 text-sm">
                  <p>{step.description}</p>
                  {step.materials.length > 0 && (
                    <p>
                      <strong>Suggested materials:</strong>{" "}
                      {step.materials.join(", ")}
                    </p>
                  )}
                  {step.timing && (
                    <p>
                      <strong>Timing:</strong> {step.timing}
                    </p>
                  )}
                  {step.safetyNotes && <p>{step.safetyNotes}</p>}
                </div>
              )}
              {!readOnly && (
                <Button
                  className={primary}
                  disabled={busy || planned || season.status === "completed"}
                  onClick={plan}
                >
                  {planned
                    ? "Plan recorded · not applied"
                    : "I plan to use this"}
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              No treatment plan was saved. You can still record the care or
              monitoring you performed.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Check the product label and local authorization before use. A past
            product or dose is not automatically suitable today.
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
        </DialogContent>
      </Dialog>
      <Dialog open={diaryOpen} onOpenChange={setDiaryOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Full care diary</DialogTitle>
            <DialogDescription>
              Planned care, actual treatments and dated follow-ups remain
              separate.
            </DialogDescription>
          </DialogHeader>
          {!readOnly && applied.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setFollowupTreatmentId("");
                setFollowup("Not yet checked");
              }}
            >
              Add condition update
            </Button>
          )}
          <CareTimeline
            events={events.items}
            seasonId={season.id}
            api={api}
            readOnly={readOnly}
            onChanged={onChanged}
          />
          {more}
        </DialogContent>
      </Dialog>
      <Dialog
        open={followup !== null}
        onOpenChange={(v) => {
          if (!v) setFollowup(null);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Update crop condition</DialogTitle>
            <DialogDescription>
              Record your observation against an applied treatment.
            </DialogDescription>
          </DialogHeader>
          {followup && (
            <EventComposer
              key={followup + followupTreatmentId}
              compact
              simple
              initialTreatmentId={followupTreatmentId}
              initialKind="followup"
              initialOutcome={followup}
              report={report}
              season={season}
              events={events.items}
              api={api}
              reports={reports}
              onSaved={() => {
                setFollowup(null);
                onChanged();
              }}
            />
          )}
          {more}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Context = {
  report: CareReport;
  seasons: CarePage<CareSeason>;
  season: CareSeason | null;
};
export default function ReportCare({
  reportId,
  scope = {},
  preferredSeasonId = "",
  showLink = true,
  compact = false,
  onOpen,
  onLinked,
  reports = [],
}: {
  reportId: string;
  scope?: Scope;
  preferredSeasonId?: string;
  showLink?: boolean;
  compact?: boolean;
  onOpen?: (id: string) => void;
  onLinked?: (seasonId: string) => void;
  reports?: CareReport[];
}) {
  const { api, ready, readOnly } = useCareApi(scope);
  const [context, setContext] = useState<Context | null>(null);
  const [events, setEvents] = useState<CarePage<CareEvent>>({
    items: [],
    nextCursor: null,
  });
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<"existing" | "new">("existing"),
    [selected, setSelected] = useState(preferredSeasonId);
  const [newOpen, setNewOpen] = useState(false),
    [careOpen, setCareOpen] = useState(false),
    [revision, setRevision] = useState(0);
  const linkedCallback = useRef(onLinked);
  linkedCallback.current = onLinked;
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContext(null);
    setEvents({ items: [], nextCursor: null });
    api<Context>(
      { resource: "context", reportId },
      undefined,
      controller.signal,
    )
      .then((c) => {
        if (!controller.signal.aborted) {
          setContext(c);
          linkedCallback.current?.(c.season?.id || "");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, ready, reportId, revision]);
  const seasonId = context?.season?.id;
  useEffect(() => {
    if (!seasonId || (compact && !careOpen)) return;
    const controller = new AbortController();
    setEventsLoading(true);
    api<CarePage<CareEvent>>(
      { resource: "events", seasonId },
      undefined,
      controller.signal,
    )
      .then((v) => {
        if (!controller.signal.aborted) setEvents(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [api, seasonId, compact, careOpen, revision]);
  useEffect(() => {
    if (scope.mode !== "community") return;
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [scope.mode, refresh]);
  async function mutate(action: "report.link" | "report.unlink") {
    const target = action === "report.link" ? selected : seasonId;
    if (!target || busy) return;
    setBusy(true);
    setError("");
    try {
      await api({}, { action, reportId, seasonId: target });
      setNotice(
        action === "report.link"
          ? "Report saved to My Crops."
          : "Choose another record below.",
      );
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this link.");
    } finally {
      setBusy(false);
    }
  }
  async function moreEvents() {
    if (!events.nextCursor || !seasonId || busy) return;
    setBusy(true);
    try {
      const next = await api<CarePage<CareEvent>>({
        resource: "events",
        seasonId,
        cursor: events.nextCursor,
      });
      setEvents({ ...next, items: [...events.items, ...next.items] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load care entries.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className={panel}>
        <Busy>Opening crop care… Your diagnosis is ready.</Busy>
      </section>
    );
  if (!context)
    return (
      <section className={panel}>
        <ErrorBox>{error || "Care history could not be loaded."}</ErrorBox>
        <Button variant="outline" className="mt-3" onClick={refresh}>
          Retry care history
        </Button>
      </section>
    );
  const { report, season } = context;
  const eligible = context.seasons.items.filter(
    (s) => !reportFitsSeason(report, s),
  );
  const journey = season ? (
    <CareJourney
      report={report}
      season={season}
      events={events}
      api={api}
      readOnly={readOnly}
      reports={reports}
      onChanged={refresh}
      onMore={moreEvents}
      moreBusy={busy}
    />
  ) : (
    <p className="text-sm text-slate-600">
      Choose an existing crop season or create a new one to record your care.
    </p>
  );
  return (
    <div
      className="min-w-0 space-y-4"
      data-care-layout={compact ? "compact" : "workspace"}
    >
      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {!showLink && (
        <section className={panel}>
          <h3 className="text-lg font-semibold">{report.disease}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {report.crop} · {date(report.createdAt)}
          </p>
        </section>
      )}
      {(showLink || !season) && (
        <section className={panel} aria-label="Add report to My Crops">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-950">
              {season ? (
                <Check className="h-5 w-5" />
              ) : (
                <Leaf className="h-5 w-5" />
              )}
              {season ? "Saved in My Crops" : "Add to My Crops"}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Refresh care history"
              onClick={refresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {season ? (
            <div className="space-y-3">
              <p className="break-words font-medium text-emerald-900">
                {season.crop} · {season.field}
              </p>
              <p className="text-sm text-slate-600">
                {season.label} ·{" "}
                {season.status === "completed" ? "Harvested" : "Growing"}
              </p>
              <p className="text-xs text-slate-500">
                {date(season.startedOn)}
                {season.endedOn ? ` – ${date(season.endedOn)}` : ""}
              </p>
              {scope.mode !== "owner" && (
                <Button asChild variant="outline" size="sm">
                  <Link href={careRecordHref(season)}>
                    Open crop & care <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              {!readOnly && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer">
                    Change linked season
                  </summary>
                  <p className="my-2">
                    Reports with saved care entries must keep their existing
                    link.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => mutate("report.unlink")}
                  >
                    Choose another record
                  </Button>
                </details>
              )}
            </div>
          ) : readOnly ? (
            <p className="text-sm text-slate-500">
              No season has been assigned to this report.
            </p>
          ) : (
            <div className="space-y-4">
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm text-slate-600">
                  Where should this report go?
                </legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`care-choice-${reportId}`}
                    className="h-4 w-4 accent-emerald-700"
                    checked={choice === "existing"}
                    onChange={() => setChoice("existing")}
                  />
                  Existing crop / season
                </label>
                {choice === "existing" && (
                  <div className="space-y-3">
                    <Label htmlFor="care-existing" className="sr-only">
                      Choose crop and season
                    </Label>
                    <select
                      id="care-existing"
                      className={select}
                      value={
                        eligible.some((s) => s.id === selected) ? selected : ""
                      }
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">Select crop & season</option>
                      {eligible.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.crop} · {s.field} · {s.label}
                        </option>
                      ))}
                    </select>
                    {!eligible.length && (
                      <p className="text-xs text-slate-500">
                        No matching record for this report’s date and plant yet.
                        Create a season or load more records.
                      </p>
                    )}
                    {context.seasons.nextCursor && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const next = await api<CarePage<CareSeason>>({
                              resource: "seasons",
                              crop: report.crop,
                              cursor: context.seasons.nextCursor!,
                            });
                            setContext({
                              ...context,
                              seasons: {
                                ...next,
                                items: [
                                  ...context.seasons.items,
                                  ...next.items,
                                ],
                              },
                            });
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not load seasons.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Load more seasons
                      </Button>
                    )}
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`care-choice-${reportId}`}
                    className="h-4 w-4 accent-emerald-700"
                    checked={choice === "new"}
                    onChange={() => setChoice("new")}
                  />
                  Create new season
                </label>
              </fieldset>
              <Button
                className={primary + " w-full"}
                disabled={
                  busy ||
                  (choice === "existing" &&
                    !eligible.some((s) => s.id === selected))
                }
                onClick={() =>
                  choice === "new" ? setNewOpen(true) : mutate("report.link")
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {choice === "new"
                  ? "Create & add report"
                  : "Save to this record"}
              </Button>
              <p className="text-xs text-slate-500">
                Reports and care stay together. Each new planting has its own
                season.
              </p>
            </div>
          )}
        </section>
      )}
      <HistoricalInsights
        key={report.id + revision}
        reportId={report.id}
        api={api}
        onOpen={onOpen}
      />
      {compact ? (
        <>
          <Button
            variant="outline"
            className="h-auto w-full justify-between gap-2 whitespace-normal p-4 text-left"
            onClick={() => setCareOpen(true)}
          >
            <span>What I used & crop care</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
          <Dialog open={careOpen} onOpenChange={setCareOpen}>
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Care for {report.crop}</DialogTitle>
                <DialogDescription>
                  {season
                    ? `${season.field} · ${season.label}`
                    : "Save this report to a crop season to begin."}
                </DialogDescription>
              </DialogHeader>
              {eventsLoading ? <Busy>Loading saved care…</Busy> : journey}
            </DialogContent>
          </Dialog>
        </>
      ) : eventsLoading ? (
        <Busy>Loading saved care…</Busy>
      ) : (
        journey
      )}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a new crop season</DialogTitle>
            <DialogDescription>
              Choose the actual planting dates. This report will be added to the
              new record.
            </DialogDescription>
          </DialogHeader>
          <SeasonForm
            crop={report.crop}
            cropId={report.cropId || undefined}
            plantId={report.plantId || undefined}
            startedOn={careDay(report.createdAt)}
            reportId={report.id}
            api={api}
            onCancel={() => setNewOpen(false)}
            onSave={() => {
              setNewOpen(false);
              setNotice("Season created and report saved.");
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
