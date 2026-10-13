"use client";
import {
  useCallback,
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
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
export function date(v: string) {
  return v
    ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString(
        undefined,
        { day: "numeric", month: "short", year: "numeric" },
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
            "Care history took too long to load. Your diagnosis is already saved; try Refresh.",
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
  reportId,
  onSave,
  onCancel,
  api,
}: {
  initial?: CareSeason;
  crop?: string;
  cropId?: string;
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
          field: "",
          label: "",
          startedOn: today(),
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
          <Label htmlFor="care-field">Field / plot / tree name</Label>
          <Input
            id="care-field"
            required
            maxLength={100}
            placeholder="Field A or Mango tree 1"
            value={values.field}
            onChange={(e) => setValues({ ...values, field: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="care-season">Season / crop cycle</Label>
          <Input
            id="care-season"
            required
            maxLength={64}
            placeholder="Rabi 2026–27 or Tomato cycle 2"
            value={values.label}
            onChange={(e) => setValues({ ...values, label: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="care-start">Planting / season start</Label>
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
          <Label htmlFor="care-status">Season status</Label>
          <select
            id="care-status"
            className={select}
            value={values.status}
            onChange={(e) =>
              setValues({
                ...values,
                status: e.target.value as SeasonInput["status"],
                ...(e.target.value === "active" ? {endedOn: undefined} : {}),
              })
            }
          >
            <option value="active">Active / growing</option>
            <option value="completed">Harvested / completed</option>
          </select>
        </div>
        {values.status === "completed" && (
          <div>
            <Label htmlFor="care-end">Harvest / season end</Label>
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
        Each planting has its own record. For a permanent tree, create a new
        season under the same tree name. Older diagnoses stay in their original
        cycle.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className={primary}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {initial ? "Save season" : "Create care record"}
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
}: {
  report: CareReport;
  season: CareSeason;
  events: CareEvent[];
  api: CareApi;
  onSaved: () => void;
  reports?: CareReport[];
}) {
  const [kind, setKind] = useState<"applied" | "followup">("applied"),
    [product, setProduct] = useState(""),
    [category, setCategory] = useState<
      "pesticide" | "cultural" | "biological" | "monitoring" | "other"
    >("pesticide"),
    [occurredOn, setOccurredOn] = useState(today()),
    [notes, setNotes] = useState(""),
    [outcome, setOutcome] =
      useState<(typeof outcomes)[number]>("Not yet checked"),
    [treatmentId, setTreatmentId] = useState(""),
    [image, setImage] = useState<string>(),
    [followupReportId, setFollowupReportId] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const applied = events.filter(
    (e) => e.kind === "applied" && !e.voidedAt && e.reportId === report.id,
  );
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
          reportId: report.id,
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
    <section className={panel}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">
          {kind === "applied"
            ? "What did you actually apply?"
            : "Add a follow-up observation"}
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
            Follow-up
          </Button>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {kind === "applied" ? (
          <>
            <div>
              <Label htmlFor="care-product">
                Pesticide / treatment actually used
              </Label>
              <Input
                id="care-product"
                value={product}
                required
                maxLength={160}
                placeholder="Enter the exact product or care action"
                onChange={(e) => setProduct(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Record what you used, even if it differs from the AI suggestion.
              </p>
            </div>
            <div>
              <Label htmlFor="care-category">Treatment category</Label>
              <select
                id="care-category"
                className={select}
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                <option value="pesticide">
                  Pesticide / crop-protection product
                </option>
                <option value="cultural">
                  Cultivation / watering / pruning
                </option>
                <option value="biological">Biological control</option>
                <option value="monitoring">
                  Monitoring / no product applied
                </option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="care-treatment">Which applied treatment?</Label>
              <select
                id="care-treatment"
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
              {!applied.length && (
                <p className="mt-2 text-sm text-slate-500">
                  Record your treatment or monitoring action first.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="care-outcome">Condition you observed</Label>
              <select
                id="care-outcome"
                className={select}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                {outcomes.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            {reports.length > 1 && (
              <div>
                <Label htmlFor="care-followup-report">
                  Follow-up diagnosis (optional)
                </Label>
                <select
                  id="care-followup-report"
                  className={select}
                  value={followupReportId}
                  onChange={(e) => setFollowupReportId(e.target.value)}
                >
                  <option value="">No linked follow-up report</option>
                  {reports
                    .filter(
                      (r) =>
                        r.id !== report.id && r.createdAt > report.createdAt,
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="care-date">
              {kind === "applied" ? "Applied / performed on" : "Follow-up date"}
            </Label>
            <Input
              id="care-date"
              required
              type="date"
              min={season.startedOn}
              max={season.endedOn || today()}
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="care-photo">Supporting photo (optional)</Label>
            <Input
              id="care-photo"
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
          <Label htmlFor="care-notes">Your notes (optional)</Label>
          <Textarea
            id="care-notes"
            value={notes}
            maxLength={2000}
            placeholder="What you did or noticed…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Button
          className={primary}
          disabled={busy || photoBusy || (kind === "followup" && !treatmentId)}
        >
          {busy || photoBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {kind === "applied" ? "Save treatment record" : "Save follow-up"}
        </Button>
        <p className="text-xs text-slate-500">
          Saved observations are farmer-reported. Each follow-up adds to the
          history; earlier observations remain.
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
        Care timeline
      </h3>
      {!rows.length && (
        <p className="text-sm text-slate-500">
          No care entries yet. A suggestion is not recorded as an applied
          treatment.
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
                    ? "Voided"
                    : e.kind === "planned"
                      ? "Planned · not applied"
                      : e.kind === "applied"
                        ? "Applied / performed"
                        : "Follow-up · farmer reported"}
                </span>
              </div>
              <p className="mt-1 font-medium">
                {e.kind === "followup" ? e.outcome : e.product}
              </p>
              {outcome && (
                <p className="mt-1 text-sm text-emerald-800">
                  Follow-up in loaded history: {outcome.outcome} · reported by farmer
                </p>
              )}
              {orphaned && (
                <p className="text-xs text-amber-800">
                  The associated treatment was voided. This observation is
                  retained for history.
                </p>
              )}
              {e.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {e.notes}
                </p>
              )}
              {e.voidedAt && (
                <p className="text-xs text-slate-500">Voided: {e.voidReason}</p>
              )}
              {e.suggestion && e.kind === "applied" && (
                <p className="mt-2 text-xs text-slate-500">
                  AI suggestion at the time: {e.suggestion.title}
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
                  Correct / void this entry
                </Button>
              )}
              {voidId === e.id && (
                <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                  <Label htmlFor={"void-" + e.id}>Reason for correction</Label>
                  <Input
                    id={"void-" + e.id}
                    value={reason}
                    maxLength={300}
                    onChange={(v) => setReason(v.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    This marks the entry as void, keeps an audit trail and
                    removes its photo. Add a corrected entry afterwards.
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
                    Void entry
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
