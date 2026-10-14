"use client";
import { outcomeText } from "@/lib/crop-care/display";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Check, Loader2, Plus, Sprout } from "lucide-react";
import { preparePlantPhoto } from "@/lib/my-crops/images";
import {
  careDay,
  outcomes,
  latestOutcome,
  type CareAction,
  type CareEvent,
  type CareReport,
  type CareSeason,
  type SeasonInput,
} from "@/lib/crop-care/models";
export type Scope = { uid?: string; mode?: "self" | "owner" | "community" };
export const panel =
  "rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";
export const select =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
export const primary = "bg-emerald-700 text-white hover:bg-emerald-800";
export const today = () => careDay();
export function date(v: string) {
  return v
    ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString(
        undefined,
        {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Karachi",
        },
      )
    : "Date not saved";
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {children}
    </p>
  );
}
export function Busy({
  children = "Loading care history…",
}: {
  children?: ReactNode;
}) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 p-3 text-sm text-emerald-800"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {children}
    </p>
  );
}
export function useCareApi({ uid, mode = "self" }: Scope = {}) {
  const { user } = useAuth();
  const api = useCallback(
    async <T,>(
      params: Record<string, string> = {},
      action?: CareAction,
      signal?: AbortSignal,
    ): Promise<T> => {
      if (!user)
        throw new Error("Please sign in to view your crop care records.");
      const token = await user.getIdToken();
      const q = new URLSearchParams({
        ...params,
        ...(uid ? { uid } : {}),
        ...(mode === "community" ? { scope: "community" } : {}),
      });
      const controller = new AbortController(),
        cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) controller.abort();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch("/api/crop-care?" + q, {
          method: action ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + token,
            ...(action ? { "Content-Type": "application/json" } : {}),
          },
          ...(action ? { body: JSON.stringify(action) } : {}),
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Care history is unavailable. Try again.",
          );
        return data;
      } catch (e) {
        if (controller.signal.aborted && !signal?.aborted)
          throw new Error(
            "Loading took too long. Your report is saved. Tap Refresh to try again.",
          );
        throw e;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
      }
    },
    [user, uid, mode],
  );
  return { api, ready: Boolean(user), readOnly: mode === "community" };
}
export type CareApi = ReturnType<typeof useCareApi>["api"];
export function SeasonForm({
  initial,
  crop = "",
  cropId,
  plantId,
  field = "",
  startedOn,
  reportId,
  onSave,
  onCancel,
  api,
}: {
  initial?: CareSeason;
  crop?: string;
  cropId?: string;
  plantId?: string;
  field?: string;
  startedOn?: string;
  reportId?: string;
  onSave: (id: string) => void;
  onCancel: () => void;
  api: CareApi;
}) {
  const [values, setValues] = useState<SeasonInput>(
    initial
      ? {
          crop: initial.crop,
          cropId: initial.cropId,
          field: initial.field,
          ...(initial.plantId ? { plantId: initial.plantId } : {}),
          label: initial.label,
          startedOn: initial.startedOn,
          ...(initial.endedOn ? { endedOn: initial.endedOn } : {}),
          status: initial.status,
        }
      : {
          crop,
          cropId,
          ...(plantId ? { plantId } : {}),
          field,
          label: "",
          startedOn: startedOn || today(),
          status: "active",
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ seasonId: string }>(
        {},
        initial
          ? {
              action: "season.update",
              seasonId: initial.id,
              version: initial.version,
              season: values,
            }
          : {
              action: "season.create",
              requestId: requestId.current,
              season: values,
              ...(reportId ? { reportId } : {}),
            },
      );
      onSave(result.seasonId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="care-crop">Crop</Label>
          <Input
            id="care-crop"
            required
            maxLength={64}
            value={values.crop}
            readOnly={Boolean(crop || initial)}
            onChange={(e) => setValues({ ...values, crop: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="care-field">Field or plant name</Label>
          <Input
            id="care-field"
            required
            maxLength={100}
            placeholder="For example, Field A or Mango tree 1"
            value={values.field}
            onChange={(e) => setValues({ ...values, field: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="care-season">Crop season</Label>
          <Input
            id="care-season"
            required
            maxLength={64}
            placeholder="For example, Wheat 2026–27"
            value={values.label}
            onChange={(e) => setValues({ ...values, label: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="care-start">Planting date</Label>
          <Input
            id="care-start"
            type="date"
            required
            max={today()}
            value={values.startedOn}
            onChange={(e) =>
              setValues({ ...values, startedOn: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="care-status">Is the crop still growing?</Label>
          <select
            id="care-status"
            className={select}
            value={values.status}
            onChange={(e) =>
              setValues({
                ...values,
                status: e.target.value as SeasonInput["status"],
                ...(e.target.value === "active" ? { endedOn: undefined } : {}),
              })
            }
          >
            <option value="active">Still growing</option>
            <option value="completed">Harvested or finished</option>
          </select>
        </div>
        {values.status === "completed" && (
          <div>
            <Label htmlFor="care-end">Harvest or finish date</Label>
            <Input
              id="care-end"
              type="date"
              required
              min={values.startedOn}
              max={today()}
              value={values.endedOn || ""}
              onChange={(e) =>
                setValues({ ...values, endedOn: e.target.value })
              }
            />
          </div>
        )}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Start a new season when you plant again. For a tree, keep its name and
        add a new season. Older reports stay saved. Dates use Pakistan time.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className={primary}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Save season
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function EventComposer({
  report,
  season,
  events,
  api,
  onSaved,
  reports = [],
  initialKind = "applied",
  initialOutcome = "Not yet checked",
  initialTreatmentId = "",
  simple = false,
  compact = false,
}: {
  report: CareReport;
  season: CareSeason;
  events: CareEvent[];
  api: CareApi;
  onSaved: () => void;
  reports?: CareReport[];
  initialKind?: "applied" | "followup";
  initialOutcome?: CareEvent["outcome"];
  initialTreatmentId?: string;
  simple?: boolean;
  compact?: boolean;
}) {
  const formId = useId();
  const [kind, setKind] = useState<"applied" | "followup">(initialKind),
    [product, setProduct] = useState(""),
    [category, setCategory] = useState<
      "pesticide" | "cultural" | "biological" | "monitoring" | "other"
    >(simple ? "other" : "pesticide"),
    [occurredOn, setOccurredOn] = useState(season.endedOn || today()),
    [notes, setNotes] = useState(""),
    [outcome, setOutcome] = useState<(typeof outcomes)[number]>(initialOutcome),
    [treatmentId, setTreatmentId] = useState(initialTreatmentId),
    [image, setImage] = useState<string>(),
    [followupReportId, setFollowupReportId] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const applied = events.filter((e) => e.kind === "applied" && !e.voidedAt);
  const treatmentReport =
    reports.find(
      (r) => r.id === applied.find((e) => e.id === treatmentId)?.reportId,
    ) || report;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || photoBusy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        {},
        {
          action: "event.add",
          requestId: requestId.current,
          seasonId: season.id,
          reportId:
            kind === "followup"
              ? applied.find((entry) => entry.id === treatmentId)?.reportId ||
                report.id
              : report.id,
          kind,
          product: kind === "applied" ? product : "",
          category,
          occurredOn,
          notes,
          outcome: kind === "followup" ? outcome : "Not yet checked",
          ...(kind === "followup" ? { treatmentId } : {}),
          ...(image ? { image } : {}),
          ...(kind === "followup" && followupReportId
            ? { followupReportId }
            : {}),
        },
      );
      requestId.current = crypto.randomUUID();
      setNotes("");
      setProduct("");
      setImage(undefined);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={simple ? "" : panel}>
      {!simple && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">
            {kind === "applied" ? "What I Used" : "Add a crop update"}
          </h3>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "applied" ? "default" : "outline"}
              onClick={() => setKind("applied")}
            >
              Treatment
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "followup" ? "default" : "outline"}
              onClick={() => setKind("followup")}
            >
              Crop update
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        {kind === "applied" ? (
          <>
            <div>
              <Label htmlFor={`${formId}-care-product`}>
                {simple
                  ? "What did you use or do?"
                  : "Product or treatment used"}
              </Label>
              <Input
                id={`${formId}-care-product`}
                value={product}
                required
                maxLength={160}
                placeholder="For example, product name or watering"
                onChange={(e) => setProduct(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Write what you actually used or did.
              </p>
            </div>
            {!simple && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-emerald-800">
                  Treatment type ·{" "}
                  {category === "pesticide" ? "Pesticide" : category}
                </summary>
                <Label
                  htmlFor={`${formId}-care-category`}
                  className="mt-3 block"
                >
                  Type of care
                </Label>
                <select
                  id={`${formId}-care-category`}
                  className={select}
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as typeof category)
                  }
                >
                  <option value="pesticide">Pesticide or spray</option>
                  <option value="cultural">
                    Watering, soil work or pruning
                  </option>
                  <option value="biological">
                    Useful insects or other natural control
                  </option>
                  <option value="monitoring">
                    Checked the crop · no product used
                  </option>
                  <option value="other">Other</option>
                </select>
              </details>
            )}
          </>
        ) : (
          <>
            <div>
              {simple && initialTreatmentId ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                  <strong>
                    {applied.find((e) => e.id === treatmentId)?.product}
                  </strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    Applied{" "}
                    {date(
                      applied.find((e) => e.id === treatmentId)?.occurredOn ||
                        "",
                    )}
                  </span>
                </p>
              ) : (
                <>
                  <Label htmlFor={`${formId}-care-treatment`}>
                    Which treatment did you use?
                  </Label>
                  <select
                    id={`${formId}-care-treatment`}
                    className={select}
                    required
                    value={treatmentId}
                    onChange={(e) => setTreatmentId(e.target.value)}
                  >
                    <option value="">Choose a saved treatment</option>
                    {applied.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.product} · {date(e.occurredOn)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {!applied.length && (
                <p className="mt-2 text-sm text-slate-500">
                  First, save what you used or did.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor={`${formId}-care-outcome`}>
                How does the crop look?
              </Label>
              <select
                id={`${formId}-care-outcome`}
                className={select}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                {outcomes.map((o) => (
                  <option key={o} value={o}>
                    {outcomeText(o)}
                  </option>
                ))}
              </select>
            </div>
            {!simple && reports.length > 1 && (
              <div>
                <Label htmlFor={`${formId}-care-followup-report`}>
                  Add a later report (optional)
                </Label>
                <select
                  id={`${formId}-care-followup-report`}
                  className={select}
                  value={followupReportId}
                  onChange={(e) => setFollowupReportId(e.target.value)}
                >
                  <option value="">No later report selected</option>
                  {reports
                    .filter(
                      (r) =>
                        r.id !== treatmentReport.id &&
                        r.createdAt > treatmentReport.createdAt,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {date(r.createdAt)} · {r.disease}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </>
        )}
        <div className={simple ? "" : "grid gap-4 sm:grid-cols-2"}>
          <div>
            <Label htmlFor={`${formId}-care-date`}>
              {kind === "applied" ? "Date used" : "Date checked"}
            </Label>
            <Input
              id={`${formId}-care-date`}
              required
              type="date"
              min={
                kind === "followup"
                  ? applied.find((e) => e.id === treatmentId)?.occurredOn ||
                    season.startedOn
                  : season.startedOn
              }
              max={season.endedOn || today()}
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
        </div>
        <details className="rounded-xl border border-emerald-100 p-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-800">
            + Add photo or note
          </summary>
          <div className="mt-3 space-y-3">
            <Label htmlFor={`${formId}-care-photo`}>Photo (optional)</Label>
            <Input
              id={`${formId}-care-photo`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy || busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPhotoBusy(true);
                setError("");
                try {
                  setImage((await preparePlantPhoto(file)).imageThumb);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not open photo.",
                  );
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </div>
          {image && (
            <div className="flex items-center gap-3">
              <img
                src={image}
                alt="Care entry photo preview"
                className="h-20 w-20 rounded-lg object-cover"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImage(undefined)}
              >
                Remove photo
              </Button>
            </div>
          )}
          <div>
            <Label htmlFor={`${formId}-care-notes`}>
              Your notes (optional)
            </Label>
            <Textarea
              id={`${formId}-care-notes`}
              value={notes}
              maxLength={2000}
              placeholder="What you did or noticed…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </details>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Button
          className={primary + (compact ? " w-full" : "")}
          disabled={busy || photoBusy || (kind === "followup" && !treatmentId)}
        >
          {busy || photoBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {kind === "applied" ? "Save treatment" : "Save update"}
        </Button>
        <p className="text-xs text-slate-500">
          Your updates are saved by date. Earlier updates stay in your history.
        </p>
      </form>
    </section>
  );
}
export function CareTimeline({
  events,
  seasonId,
  api,
  readOnly,
  onChanged,
}: {
  events: CareEvent[];
  seasonId: string;
  api: CareApi;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [voidId, setVoidId] = useState(""),
    [reason, setReason] = useState("");
  const rows = [...events].sort(
    (a, b) =>
      b.occurredOn.localeCompare(a.occurredOn) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <section className={panel}>
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        <Sprout className="h-5 w-5 text-emerald-700" />
        Care history
      </h3>
      {!rows.length && (
        <p className="text-sm text-slate-500">
          No care saved yet. A suggested treatment is not marked as used.
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <ol className="space-y-4">
        {rows.map((e) => {
          const outcome =
            e.kind === "applied" ? latestOutcome(events, e.id) : null;
          const orphaned =
            e.kind === "followup" &&
            events.some((t) => t.id === e.treatmentId && t.voidedAt);
          return (
            <li
              key={e.id}
              className={`border-l-2 border-emerald-200 pl-4 ${e.voidedAt ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {date(e.occurredOn)}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                  {e.voidedAt
                    ? "Marked as a mistake"
                    : e.kind === "planned"
                      ? "Planned · not used yet"
                      : e.kind === "applied"
                        ? "Used or done"
                        : "Your crop update"}
                </span>
              </div>
              <p className="mt-1 font-medium">
                {e.kind === "followup" ? outcomeText(e.outcome) : e.product}
              </p>
              {outcome && (
                <p className="mt-1 text-sm text-emerald-800">
                  Crop update: {outcomeText(outcome.outcome)} · reported by
                  farmer
                </p>
              )}
              {orphaned && (
                <p className="text-xs text-amber-800">
                  The treatment was marked as a mistake. This update stays in
                  the history.
                </p>
              )}
              {e.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {e.notes}
                </p>
              )}
              {e.voidedAt && (
                <p className="text-xs text-slate-500">
                  Marked as a mistake: {e.voidReason}
                </p>
              )}
              {e.suggestion && e.kind === "applied" && (
                <p className="mt-2 text-xs text-slate-500">
                  AI suggested: {e.suggestion.title}
                </p>
              )}
              {e.hasImage && !e.voidedAt && !photos[e.id] && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy === e.id}
                  onClick={async () => {
                    setBusy(e.id);
                    setError("");
                    try {
                      const p = await api<{ image: string }>({
                        resource: "event-image",
                        seasonId,
                        eventId: e.id,
                      });
                      setPhotos((v) => ({ ...v, [e.id]: p.image }));
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Photo unavailable.",
                      );
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  View photo
                </Button>
              )}
              {photos[e.id] && !e.voidedAt && (
                <img
                  src={photos[e.id]}
                  alt="Saved treatment or follow-up photo"
                  loading="lazy"
                  className="mt-3 max-h-56 max-w-full rounded-xl"
                />
              )}
              {!readOnly && !e.voidedAt && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs text-slate-500"
                  onClick={() => {
                    setVoidId(e.id);
                    setReason("");
                  }}
                >
                  Mark as a mistake
                </Button>
              )}
              {voidId === e.id && (
                <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                  <Label htmlFor={"void-" + e.id}>What was wrong?</Label>
                  <Input
                    id={"void-" + e.id}
                    value={reason}
                    maxLength={300}
                    onChange={(v) => setReason(v.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    This marks the entry as a mistake and removes its photo. The
                    old text stays in history. You can then add the correct
                    entry.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!reason.trim() || Boolean(busy)}
                    onClick={async () => {
                      setBusy(e.id);
                      setError("");
                      try {
                        await api(
                          {},
                          {
                            action: "event.void",
                            seasonId,
                            eventId: e.id,
                            version: e.version,
                            reason,
                          },
                        );
                        setVoidId("");
                        setPhotos({});
                        onChanged();
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not save correction.",
                        );
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Mark as a mistake
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVoidId("")}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
