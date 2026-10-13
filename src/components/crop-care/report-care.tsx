"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  History,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  Link2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  CareEvent,
  CarePage,
  CareReport,
  CareSeason,
  HistoryResult,
  HistoricalMatch,
} from "@/lib/crop-care/models";
import { latestOutcome } from "@/lib/crop-care/models";
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

export function HistoricalInsights({
  reportId,
  api,
  onOpen,
}: {
  reportId: string;
  api: CareApi;
  onOpen?: (id: string) => void;
}) {
  const [data, setData] = useState<HistoryResult | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
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
      .then(setData)
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
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <h3 className="flex items-center gap-2 font-semibold text-emerald-950">
        <History className="h-5 w-5" />
        Your previous crop history
      </h3>
      <p className="mt-1 text-xs text-slate-600">
        Compares saved diagnosis labels across crop cycles. No extra diagnosis
        request.
      </p>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {busy && !data && <Busy>Looking for relevant earlier records…</Busy>}
      {data && (
        <div className="mt-4 space-y-3">
          {!data.matches.length && (
            <p className="text-sm text-slate-600">
              {data.previousCount
                ? "No matching disease or pest was found in the earlier records checked. A different issue or uncertain diagnosis is not treated as a recurrence."
                : data.nextCursor
                  ? "No earlier record in this batch. Load more history to check other records."
                  : "No earlier record found for this crop. This diagnosis can start your care history."}
            </p>
          )}
          {data.matches.map((m) => (
            <HistoryMatch key={m.report.id} match={m} onOpen={onOpen} />
          ))}
          {data.unassignedCount > 0 && (
            <p className="text-xs text-slate-500">
              {data.unassignedCount} earlier{" "}
              {data.unassignedCount === 1 ? "report has" : "reports have"} no
              assigned season. Dates alone do not establish which planting they
              belonged to.
            </p>
          )}
          {data.nextCursor && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={more}
            >
              {busy ? "Loading…" : "Load more history across all years"}
            </Button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Past improvement is farmer-reported, not proof that a product caused it.
        A past product is not automatically recommended for today’s diagnosis.
      </p>
    </section>
  );
}
function HistoryMatch({
  match: m,
  onOpen,
}: {
  match: HistoricalMatch;
  onOpen?: (id: string) => void;
}) {
  const applied = m.treatments.filter(
    (e) => e.kind === "applied" && !e.voidedAt,
  );
  return (
    <article className="rounded-xl border border-emerald-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">
          {m.season ? m.season.label : "Season not assigned"} ·{" "}
          {date(m.report.createdAt)}
        </h4>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {m.match === "same"
            ? "Same recorded diagnosis"
            : "Similar / uncertain"}
        </span>
      </div>
      <p className="mt-2 text-sm">{m.report.disease}</p>
      {m.season && (
        <p className="mt-1 text-xs text-slate-500">
          {m.season.field} ·{" "}
          {m.season.status === "completed"
            ? "Harvested / completed"
            : "Separate crop cycle"}
          {m.fieldRelation === "different" ? " · Different growing area" : ""}
        </p>
      )}
      <p className="mt-2 text-xs leading-5 text-slate-600">{m.explanation}</p>
      {applied.length ? (
        <div className="mt-3 space-y-2">
          {applied.map((e) => {
            const o = m.moreCareAvailable
              ? undefined
              : latestOutcome(m.treatments, e.id);
            return (
              <div key={e.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p>
                  <strong>You recorded:</strong> {e.product} ·{" "}
                  {date(e.occurredOn)}
                </p>
                <p className="mt-1 text-slate-600">
                  Outcome:{" "}
                  {o
                    ? `${o.outcome} — reported by farmer`
                    : m.moreCareAvailable
                      ? "Open the full record for all observations"
                      : "Not yet checked / not recorded"}
                </p>
                {e.suggestion && (
                  <p className="mt-1 text-xs text-slate-500">
                    AI suggestion then: {e.suggestion.title}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          No actual treatment was recorded for this diagnosis.
        </p>
      )}
      {m.moreCareAvailable && (
        <p className="mt-2 text-xs text-slate-500">
          Showing a portion of this diagnosis’s care entries. Open the saved
          report to load its full history.
        </p>
      )}
      {onOpen ? (
        <Button variant="link" size="sm" onClick={() => onOpen(m.report.id)}>
          Open saved report
        </Button>
      ) : (
        <Link
          className="mt-3 inline-block text-sm text-emerald-800 underline"
          href={"/report/" + m.report.id}
        >
          Open saved report
        </Link>
      )}
    </article>
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
  onOpen,
  onLinked,
  reports = [],
}: {
  reportId: string;
  scope?: Scope;
  preferredSeasonId?: string;
  showLink?: boolean;
  onOpen?: (id: string) => void;
  onLinked?: (seasonId: string) => void;
  reports?: CareReport[];
}) {
  const { api, ready, readOnly } = useCareApi(scope);
  const [context, setContext] = useState<Context | null>(null),
    [events, setEvents] = useState<CarePage<CareEvent>>({
      items: [],
      nextCursor: null,
    }),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [choice, setChoice] = useState<"existing" | "new">("existing"),
    [selected, setSelected] = useState(preferredSeasonId),
    [newOpen, setNewOpen] = useState(false),
    [stepIndex, setStepIndex] = useState(0),
    [revision, setRevision] = useState(0);
  const planRequest = useRef(crypto.randomUUID());
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
      .then(async (c) => {
        if (controller.signal.aborted) return;
        setContext(c);
        onLinked?.(c.season?.id || "");
        setLoading(false);
        setStepIndex(0);
        if (c.season) {
          const entries = await api<CarePage<CareEvent>>(
            { resource: "events", seasonId: c.season.id, reportId },
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) setEvents(entries);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, ready, reportId, revision]);
  useEffect(() => {
    if (scope.mode !== "community") return;
    const id = setInterval(() => setRevision((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, [scope.mode]);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  async function link() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api({}, { action: "report.link", reportId, seasonId: selected });
      setNotice("Report linked to Health & Care.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link report.");
    } finally {
      setBusy(false);
    }
  }
  async function plan() {
    if (!context?.season || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        {},
        {
          action: "event.add",
          requestId: planRequest.current,
          seasonId: context.season.id,
          reportId,
          kind: "planned",
          product: "",
          category: "other",
          occurredOn: today(),
          notes: "",
          outcome: "Not yet checked",
          stepIndex,
        },
      );
      planRequest.current = crypto.randomUUID();
      setNotice("Plan saved. Nothing has been marked as applied.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className={panel}>
        <Busy>Loading Health & Care… Your diagnosis is already available.</Busy>
      </section>
    );
  if (!context)
    return (
      <section className={panel}>
        <ErrorBox>{error || "Care record could not be loaded."}</ErrorBox>
        <Button variant="outline" className="mt-3" onClick={refresh}>
          Retry care history
        </Button>
      </section>
    );
  const { report, season } = context,
    step = report.plan?.steps[stepIndex],
    planned = events.items.some(
      (e) =>
        e.kind === "planned" &&
        !e.voidedAt &&
        e.suggestion?.title === step?.title,
    );
  return (
    <div className="space-y-5">
      {!showLink && (
        <section className={panel}>
          <div className="flex items-start gap-4">
            {report.image && (
              <img
                src={report.image}
                alt="Saved crop diagnosis"
                className="h-24 w-24 rounded-xl object-cover"
              />
            )}
            <div>
              <h3 className="text-xl font-semibold text-emerald-950">
                {report.disease}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {report.crop} · {date(report.createdAt)} · {report.severity}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                {report.description}
              </p>
            </div>
          </div>
        </section>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {showLink && (
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Leaf className="h-5 w-5 text-emerald-700" />
              Health & Care
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              aria-label="Refresh care history"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {season ? (
            <div className="space-y-3">
              <p className="font-medium text-emerald-900">
                {season.crop} · {season.field} · {season.label}
              </p>
              <p className="text-xs text-slate-500">
                {date(season.startedOn)} –{" "}
                {season.endedOn ? date(season.endedOn) : "Growing"} ·{" "}
                {season.status === "completed"
                  ? "Harvested / completed"
                  : "Active season"}
              </p>
              {!readOnly && scope.mode !== "owner" && (
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={"/my-crops/health?seasonId=" + season.id}>
                      Open Health & Care record
                    </Link>
                  </Button>
                  {!events.items.length && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api(
                            {},
                            {
                              action: "report.unlink",
                              reportId,
                              seasonId: season.id,
                            },
                          );
                          refresh();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not unlink.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Change linked record
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : readOnly ? (
            <p className="text-sm text-slate-500">
              No growing season has been assigned to this report.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Where would you like to save this report’s care history?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={choice === "existing" ? "default" : "outline"}
                  className={choice === "existing" ? primary : ""}
                  onClick={() => {
                    setChoice("existing");
                    setNewOpen(false);
                  }}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Existing Health & Care record
                </Button>
                <Button
                  variant={choice === "new" ? "default" : "outline"}
                  className={choice === "new" ? primary : ""}
                  onClick={() => {
                    setChoice("new");
                    setNewOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New season / crop cycle
                </Button>
              </div>
              {choice === "existing" && (
                <>
                  <Label htmlFor="care-existing">
                    Choose the matching crop, field and season
                  </Label>
                  <select
                    id="care-existing"
                    className={select}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Select a care record</option>
                    {context.seasons.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.crop} · {s.field} · {s.label} ({s.status})
                      </option>
                    ))}
                  </select>
                  {!context.seasons.items.length && (
                    <p className="text-sm text-slate-500">
                      No care record for this crop yet. Create its first season
                      above.
                    </p>
                  )}
                  {context.seasons.nextCursor && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
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
                              items: [...context.seasons.items, ...next.items],
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
                  <Button
                    className={primary}
                    disabled={!selected || busy}
                    onClick={link}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    Add report to selected record
                  </Button>
                  <p className="text-xs text-slate-500">
                    A new planting needs a new season. Reports outside a
                    completed season’s dates cannot be added to it.
                  </p>
                </>
              )}
              {newOpen && (
                <SeasonForm
                  crop={report.crop}
                  cropId={report.cropId || undefined}
                  reportId={report.id}
                  api={api}
                  onCancel={() => {
                    setNewOpen(false);
                    setChoice("existing");
                  }}
                  onSave={() => {
                    setNewOpen(false);
                    setNotice("New season created and report linked.");
                    refresh();
                  }}
                />
              )}
            </div>
          )}
        </section>
      )}
      <HistoricalInsights
        key={report.id + ":" + revision}
        reportId={report.id}
        api={api}
        onOpen={onOpen}
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="font-semibold text-emerald-950">
              AI Suggested Care
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Saved diagnosis guidance · not an applied treatment
            </p>
            {report.plan?.steps.length ? (
              <>
                <Label htmlFor="care-step" className="mt-4 block">
                  Suggested care step
                </Label>
                <select
                  id="care-step"
                  className={select + " mt-2"}
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
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="whitespace-pre-wrap">{step.description}</p>
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
                    {step.safetyNotes && (
                      <p className="text-slate-600">{step.safetyNotes}</p>
                    )}
                  </div>
                )}
                {!readOnly && (
                  <Button
                    type="button"
                    className={"mt-4 " + primary}
                    disabled={
                      busy ||
                      !season ||
                      planned ||
                      season.status === "completed"
                    }
                    onClick={plan}
                  >
                    {planned
                      ? "Plan recorded · not applied"
                      : "I plan to use this"}
                  </Button>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm">
                No treatment plan was saved for this diagnosis. You can still
                record monitoring or care you actually performed.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-600">
              AI suggestions are not verified product registrations. Confirm the
              current diagnosis, local authorization and exact product label
              before selecting a pesticide; never reuse last season’s dose
              automatically.
            </p>
            <a
              href="https://agripunjab.gov.pk/pw_literature"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-800 underline"
            >
              Punjab crop-protection reference library{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
            {!season && !readOnly && (
              <p className="mt-3 text-sm font-medium text-emerald-900">
                Link this report to a season above to save plans, treatments and
                follow-ups.
              </p>
            )}
          </section>
          {season && !readOnly && (
            <EventComposer
              key={report.id + ":" + season.id}
              report={report}
              season={season}
              events={events.items}
              api={api}
              reports={reports}
              onSaved={() => {
                setNotice("Care entry saved.");
                refresh();
              }}
            />
          )}
        </div>
        {season && (
          <div className="space-y-3">
            <CareTimeline
              key={report.id + ":" + revision}
              events={events.items}
              seasonId={season.id}
              api={api}
              readOnly={readOnly}
              onChanged={refresh}
            />
            {events.nextCursor && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const next = await api<CarePage<CareEvent>>({
                      resource: "events",
                      seasonId: season.id,
                      reportId: report.id,
                      cursor: events.nextCursor!,
                    });
                    setEvents({
                      ...next,
                      items: [...events.items, ...next.items],
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not load care entries.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load more care entries
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
