"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  Leaf,
  Loader2,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OwnerCrop } from "@/lib/owner-admin";
import type {
  FarmPlant,
  FarmRecord,
  FarmReport,
  FarmResource,
  FarmWorkspace,
  WorkspaceApi,
} from "@/lib/farmer-workspace";
export const farmCard =
  "rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not recorded";
const label = (v: string) =>
  v.replace(/([A-Z])/g, " $1").replace(/^[a-z]/, (c) => c.toUpperCase());
type Field = {
  key: string;
  title: string;
  value: string | number | boolean;
  type?: "text" | "textarea" | "number" | "checkbox" | "select";
  options?: string[];
  max?: number;
};
type Edit = {
  title: string;
  action: Record<string, unknown>;
  fields: Field[];
  nested?: boolean;
  plan?: NonNullable<FarmReport["plan"]>;
};
type Confirm = {
  title: string;
  description: string;
  action: Record<string, unknown>;
  match?: string;
};
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-6 text-sm text-slate-500">
      {children}
    </p>
  );
}
function Photo({
  src,
  name,
  large = false,
}: {
  src: string;
  name: string;
  large?: boolean;
}) {
  return src ? (
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={
        large
          ? "h-52 w-full rounded-xl bg-emerald-50 object-contain"
          : "h-16 w-16 shrink-0 rounded-xl bg-emerald-50 object-cover"
      }
    />
  ) : (
    <span
      className={`flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ${large ? "h-52 w-full" : "h-16 w-16 shrink-0"}`}
    >
      <Leaf size={large ? 42 : 25} />
    </span>
  );
}
function ReportContent({ report }: { report: FarmReport }) {
  return (
    <div className="space-y-5">
      <Photo
        src={report.image}
        name={`${report.plantName || report.crop} saved scan`}
        large
      />
      <div>
        <p className="text-xs text-slate-500">
          {report.crop} · {report.plantName || "Standalone report"} ·{" "}
          {date(report.createdAt)}
        </p>
        <h3 className="mt-2 text-xl font-bold">{report.disease}</h3>
        <p className="mt-1 text-sm text-emerald-800">
          {report.status} · Severity: {report.severity || "Not recorded"}
        </p>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
          {report.description}
        </p>
      </div>
      {report.symptoms && (
        <section>
          <h4 className="font-semibold">Recorded symptoms</h4>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {report.symptoms}
          </p>
        </section>
      )}
      {report.plan && (
        <section>
          <h4 className="font-semibold">Saved care plan</h4>
          <p className="mt-1 text-xs text-slate-500">
            {report.plan.timeline}
            {report.plan.totalCost > 0
              ? ` · Estimated PKR ${report.plan.totalCost.toLocaleString()}`
              : ""}
          </p>
          <ol className="mt-3 space-y-3">
            {report.plan.steps.map((step, i) => (
              <li key={i} className="rounded-xl bg-emerald-50 p-4">
                <h5 className="font-medium">
                  {i + 1}. {step.title}
                </h5>
                <p className="mt-2 whitespace-pre-line text-sm leading-6">
                  {step.description}
                </p>
                {step.materials.length > 0 && (
                  <p className="mt-2 text-sm">
                    Materials: {step.materials.join(", ")}
                  </p>
                )}
                {step.timing && (
                  <p className="mt-2 text-xs">When: {step.timing}</p>
                )}
                {step.safetyNotes && (
                  <p className="mt-2 text-xs text-amber-800">
                    {step.safetyNotes}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {report.plan.preventionTips.length > 0 && (
            <div className="mt-4">
              <h5 className="font-medium">Prevention</h5>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {report.plan.preventionTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {report.protectionPlan && (
        <section>
          <h4 className="font-semibold">
            Protection plan · {report.protectionPlan.duration}
          </h4>
          {report.protectionPlan.phases.map((p, i) => (
            <div key={i} className="mt-3 rounded-xl border p-3">
              <p className="font-medium">
                Week {p.week}: {p.title}
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {p.tasks.map((t, j) => (
                  <li key={j}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
          <ul className="mt-3 list-disc pl-5 text-sm">
            {report.protectionPlan.recommendations.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-xl bg-slate-50 p-4">
        <h4 className="font-semibold">Care notes & progress</h4>
        <p className="mt-2 text-sm">
          {report.progress || "No progress update recorded"}
        </p>
        <p className="mt-2 whitespace-pre-line text-sm">
          {report.careNotes || "No additional care notes."}
        </p>
      </section>
      <section>
        <h4 className="font-semibold">Report change history</h4>
        {report.history.length ? (
          report.history.map((h, i) => (
            <details key={i} className="mt-3 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">
                {h.action} · {date(h.changedAt)}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ["Before", h.previousData],
                  ["After", h.newData],
                ].map(([title, data]) => (
                  <div key={String(title)}>
                    <h5 className="text-xs font-semibold uppercase text-slate-500">
                      {String(title)}
                    </h5>
                    {Object.entries(data || {}).map(([k, v]) => (
                      <p key={k} className="mt-1 text-sm">
                        <strong>{label(k)}:</strong> {String(v)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No subsequent changes recorded.
          </p>
        )}
      </section>
    </div>
  );
}
function RecordCollection({
  resource,
  api,
  revision,
  onEdit,
  onDelete,
}: {
  resource: FarmResource;
  api: WorkspaceApi;
  revision: number;
  onEdit: (record: FarmRecord, resource: FarmResource) => void;
  onDelete: (record: FarmRecord, resource: FarmResource) => void;
}) {
  const [records, setRecords] = useState<FarmRecord[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const seq = ++sequence.current;
      setLoading(true);
      try {
        const r = await api<{ records: FarmRecord[]; hasMore: boolean }>(
          `&resource=${resource}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (seq !== sequence.current) return;
        setRecords((old) => (cursor ? [...old, ...r.records] : r.records));
        setMore(r.hasMore);
        setError("");
      } catch (e) {
        if (seq === sequence.current) setError((e as Error).message);
      } finally {
        if (seq === sequence.current) setLoading(false);
      }
    },
    [api, resource],
  );
  useEffect(() => {
    setRecords([]);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load, revision]);
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">
        {resource === "contacts" ? "Supplier contact history" : label(resource)}
      </h3>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </p>
      )}
      {records.map((r) => (
        <article key={r.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-medium">{r.title}</h4>
              <p className="mt-1 text-xs text-slate-500">{date(r.createdAt)}</p>
            </div>
            {resource !== "logs" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(r, resource)}
                >
                  Edit
                </Button>
                <Button
                  aria-label={`Delete ${r.title}`}
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 text-red-600"
                  onClick={() => onDelete(r, resource)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            )}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(r.values).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{label(k)}</dt>
                <dd className="mt-1 whitespace-pre-line break-words">
                  {Array.isArray(v)
                    ? v.join(", ")
                    : typeof v === "boolean"
                      ? v
                        ? "Yes"
                        : "No"
                      : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      {loading ? (
        <p role="status" className="text-sm text-slate-500">
          Loading records…
        </p>
      ) : !records.length && !error ? (
        <Empty>No saved {resource} for this farmer.</Empty>
      ) : null}
      {more && (
        <Button
          disabled={loading}
          variant="outline"
          onClick={() => void load(records.at(-1)?.id)}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
export default function FarmerWorkspace({
  uid,
  owner,
  api,
  onBack,
}: {
  uid: string;
  owner: boolean;
  api: WorkspaceApi;
  onBack: () => void;
}) {
  const [data, setData] = useState<FarmWorkspace | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("Crops & plants"),
    [cropId, setCropId] = useState(""),
    [plantId, setPlantId] = useState(""),
    [revision, setRevision] = useState(0);
  const [plants, setPlants] = useState<FarmPlant[]>([]),
    [plantsMore, setPlantsMore] = useState(false),
    [plantsLoading, setPlantsLoading] = useState(false);
  const [records, setRecords] = useState<FarmReport[]>([]),
    [recordsMore, setRecordsMore] = useState(false),
    [recordCursor, setRecordCursor] = useState(""),
    [recordsLoading, setRecordsLoading] = useState(false);
  const [report, setReport] = useState<FarmReport | null>(null),
    [reportLoading, setReportLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Edit | null>(null),
    [confirmation, setConfirmation] = useState<Confirm | null>(null),
    [confirmationText, setConfirmationText] = useState(""),
    [dialogError, setDialogError] = useState("");
  const [search, setSearch] = useState(""),
    [beforeId, setBeforeId] = useState(""),
    [afterId, setAfterId] = useState("");
  const seq = useRef(0),
    plantSeq = useRef(0),
    recordsSeq = useRef(0),
    reportSeq = useRef(0);
  const scoped = useCallback<WorkspaceApi>(
    (query = "", action) =>
      api(`?uid=${encodeURIComponent(uid)}${query}`, action),
    [api, uid],
  );
  const load = useCallback(
    async (silent = false) => {
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await scoped<FarmWorkspace>("&resource=workspace");
        if (id !== seq.current) return;
        setData(d);
        setCropId((old) =>
          d.crops.some((c) => c.id === old) ? old : d.crops[0]?.id || "",
        );
        setError("");
      } catch (e) {
        if (id === seq.current) {
          setError((e as Error).message);
          if (!owner) {
            setData(null);
            setPlants([]);
            setRecords([]);
            setReport(null);
          }
        }
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [scoped, owner],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60000);
    return () => {
      seq.current++;
      reportSeq.current++;
      clearInterval(timer);
    };
  }, [load]);
  const loadPlants = useCallback(
    async (cursor?: string) => {
      if (!cropId) return;
      const id = ++plantSeq.current;
      setPlantsLoading(true);
      try {
        const r = await scoped<{ plants: FarmPlant[]; hasMore: boolean }>(
          `&resource=plants&cropId=${encodeURIComponent(cropId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (id !== plantSeq.current) return;
        setPlants((old) => (cursor ? [...old, ...r.plants] : r.plants));
        setPlantsMore(r.hasMore);
      } catch (e) {
        if (id === plantSeq.current) setError((e as Error).message);
      } finally {
        if (id === plantSeq.current) setPlantsLoading(false);
      }
    },
    [scoped, cropId],
  );
  useEffect(() => {
    setPlants([]);
    setPlantId("");
    void loadPlants();
    return () => {
      plantSeq.current++;
    };
  }, [loadPlants, revision]);
  const loadRecords = useCallback(
    async (cursor?: string) => {
      if (!cropId || !plantId) return;
      const id = ++recordsSeq.current;
      setRecordsLoading(true);
      try {
        const r = await scoped<{
          reports: FarmReport[];
          hasMore: boolean;
          cursor: string;
        }>(
          `&resource=plant-records&cropId=${encodeURIComponent(cropId)}&plantId=${encodeURIComponent(plantId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (id !== recordsSeq.current) return;
        setRecords((old) => (cursor ? [...old, ...r.reports] : r.reports));
        setRecordsMore(r.hasMore);
        setRecordCursor(r.cursor);
      } catch (e) {
        if (id === recordsSeq.current) setError((e as Error).message);
      } finally {
        if (id === recordsSeq.current) setRecordsLoading(false);
      }
    },
    [scoped, cropId, plantId],
  );
  useEffect(() => {
    setRecords([]);
    setBeforeId("");
    setAfterId("");
    void loadRecords();
    return () => {
      recordsSeq.current++;
    };
  }, [loadRecords, revision]);
  async function openReport(id: string) {
    const request = ++reportSeq.current;
    setReportLoading(true);
    setError("");
    try {
      const r = await scoped<FarmReport>(
        `&resource=workspace-report&report=${encodeURIComponent(id)}`,
      );
      if (request === reportSeq.current) setReport(r);
    } catch (e) {
      if (request === reportSeq.current) setError((e as Error).message);
    } finally {
      if (request === reportSeq.current) setReportLoading(false);
    }
  }
  async function mutate(action: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setDialogError("");
    try {
      await scoped("", { ...action, uid });
      setEditor(null);
      setConfirmation(null);
      setReport(null);
      setNotice("Changes saved. The owner activity history has been updated.");
      if (action.action === "account.delete") {
        onBack();
        return;
      }
      await load(true);
      setRevision((v) => v + 1);
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(value: Edit) {
    setDialogError("");
    setEditor(value);
  }
  function confirm(value: Confirm) {
    setDialogError("");
    setConfirmationText("");
    setConfirmation(value);
  }
  function editCrop(c: OwnerCrop) {
    edit({
      title: "Edit crop details",
      action: { action: "crop.update", cropId: c.id, version: c.version },
      fields: [
        { key: "name", title: "Crop name", value: c.name, max: 64 },
        {
          key: "notes",
          title: "Crop notes",
          value: c.notes,
          type: "textarea",
          max: 1500,
        },
      ],
    });
  }
  function editPlant(p: FarmPlant) {
    edit({
      title: "Edit plant details",
      action: {
        action: "plant.update",
        cropId: p.cropId,
        plantId: p.id,
        version: p.version,
      },
      fields: [
        { key: "name", title: "Plant name", value: p.name, max: 64 },
        { key: "age", title: "Plant age", value: p.age, max: 80 },
        {
          key: "notes",
          title: "Plant notes",
          value: p.notes,
          type: "textarea",
          max: 2000,
        },
      ],
    });
  }
  function editReport(r: FarmReport) {
    setReport(null);
    edit({
      title: "Edit report & care progress",
      action: { action: "report.update", reportId: r.id, version: r.version },
      fields: [
        {
          key: "disease",
          title: "Recorded diagnosis",
          value: r.disease,
          max: 150,
        },
        {
          key: "description",
          title: "Diagnosis details",
          value: r.description,
          type: "textarea",
          max: 6000,
        },
        {
          key: "symptoms",
          title: "Recorded symptoms",
          value: r.symptoms,
          type: "textarea",
          max: 2000,
        },
        {
          key: "severity",
          title: "Severity",
          value: r.severity || "None",
          type: "select",
          options: ["None", "Low", "Medium", "High"],
        },
        {
          key: "careNotes",
          title: "Care / treatment notes",
          value: r.careNotes,
          type: "textarea",
          max: 4000,
        },
        {
          key: "progress",
          title: "Recorded progress",
          value: r.progress || "Not recorded",
          type: "select",
          options: [
            "Not recorded",
            "Treatment ongoing",
            "Improved",
            "Unchanged",
            "Worse",
            "Resolved",
          ],
        },
      ],
    });
  }
  function editPlan(r: FarmReport) {
    if (!r.plan) return;
    setReport(null);
    edit({
      title: "Edit saved care plan",
      action: { action: "plan.update", reportId: r.id, version: r.version },
      plan: r.plan,
      fields: [
        {
          key: "timeline",
          title: "Plan timeline",
          value: r.plan.timeline,
          max: 300,
        },
        {
          key: "totalCost",
          title: "Estimated total cost (PKR)",
          value: r.plan.totalCost,
          type: "number",
        },
        {
          key: "preventionTips",
          title: "Prevention tips (one per line)",
          value: r.plan.preventionTips.join("\n"),
          type: "textarea",
        },
        ...r.plan.steps.flatMap((step, i) => [
          {
            key: `step_${i}_title`,
            title: `Step ${i + 1}: title`,
            value: step.title,
            max: 200,
          },
          {
            key: `step_${i}_description`,
            title: "Instructions",
            value: step.description,
            type: "textarea" as const,
            max: 6000,
          },
          {
            key: `step_${i}_timing`,
            title: "Timing",
            value: step.timing,
            max: 500,
          },
          {
            key: `step_${i}_materials`,
            title: "Materials (one per line)",
            value: step.materials.join("\n"),
            type: "textarea" as const,
          },
          {
            key: `step_${i}_cost`,
            title: "Estimated step cost (PKR)",
            value: step.cost,
            type: "number" as const,
          },
          {
            key: `step_${i}_safetyNotes`,
            title: "Safety notes",
            value: step.safetyNotes,
            type: "textarea" as const,
            max: 2000,
          },
        ]),
      ],
    });
  }
  function editRecord(r: FarmRecord, resource: FarmResource) {
    edit({
      title: `Edit ${r.title}`,
      action: {
        action: "record.update",
        resource,
        recordId: r.id,
        version: r.version,
      },
      nested: true,
      fields: Object.entries(r.values)
        .filter(([k]) => !["supplierId", "type"].includes(k))
        .map(([key, value]) => ({
          key,
          title: label(key),
          value: Array.isArray(value) ? value.join(", ") : value,
          type:
            typeof value === "boolean"
              ? "checkbox"
              : typeof value === "number"
                ? "number"
                : ["message", "description", "notes", "review"].includes(key)
                  ? "textarea"
                  : "text",
          max: 4000,
        })),
    });
  }
  function removeRecord(r: FarmRecord, resource: FarmResource) {
    confirm({
      title: `Delete ${r.title}?`,
      description: "This removes the saved record from this farmer’s account.",
      action: {
        action: "record.delete",
        resource,
        recordId: r.id,
        version: r.version,
      },
      match: "DELETE",
    });
  }
  async function more(resource: "crops" | "workspace-reports") {
    if (!data || busy) return;
    setBusy(true);
    try {
      const old = resource === "crops" ? data.crops : data.reports;
      const r = await scoped<{
        crops: OwnerCrop[];
        reports: FarmReport[];
        hasMore: boolean;
      }>(`&resource=${resource}&cursor=${encodeURIComponent(old.at(-1)!.id)}`);
      setData((d) =>
        d
          ? resource === "crops"
            ? { ...d, crops: [...d.crops, ...r.crops], hasMoreCrops: r.hasMore }
            : {
                ...d,
                reports: [...d.reports, ...r.reports],
                hasMoreReports: r.hasMore,
              }
          : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const crop = data?.crops.find((c) => c.id === cropId),
    plant = plants.find((p) => p.id === plantId);
  const complete = records.filter((r) => r.status === "Complete");
  const earlier = complete.find((r) => r.id === beforeId) || complete.at(-1),
    latest = complete.find((r) => r.id === afterId) || complete[0];
  const tabs = owner
    ? [
        "Overview",
        "Crops & plants",
        "Reports",
        "Progress",
        "Marketplace",
        "Community",
        "Profile",
        "Activity",
      ]
    : ["Crops & plants", "Reports", "Care history", "Progress"];
  const reports =
    data?.reports.filter((r) =>
      `${r.crop} ${r.plantName} ${r.disease}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
          {owner ? <ShieldCheck size={20} /> : <Eye size={20} />}{" "}
          {owner
            ? `You are viewing ${data?.name || "this farmer"}’s account as owner`
            : "Shared farmer account · View only"}
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={15} className="mr-2" />
          Back to farmers
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <Button
            className="ml-3"
            variant="outline"
            size="sm"
            onClick={() => {
              void load();
              void loadPlants();
              void loadRecords();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loading && !data && (
        <p role="status" className="flex items-center gap-2 p-8">
          <Loader2 className="animate-spin" />
          Opening farmer workspace…
        </p>
      )}
      {data && (
        <>
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-800">
                {data.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <h1 className="text-2xl font-bold sm:text-3xl">
                  {data.name}’s {owner ? "account" : "shared account"}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {owner
                    ? "Complete farmer workspace"
                    : "Crops, reports and growing progress"}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <MapPin size={13} />
                  {data.city || "City not shared"}
                  {owner && (
                    <span
                      className={`rounded-full px-2 py-1 ${data.farmer?.disabled ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
                    >
                      {data.farmer?.disabled ? "Suspended" : "Active"}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-label="Refresh farmer workspace"
                variant="outline"
                size="icon"
                disabled={loading}
                onClick={() => {
                  void load();
                  setRevision((v) => v + 1);
                }}
              >
                <RefreshCw size={16} />
              </Button>
              {owner && (
                <>
                  <Button
                    onClick={() =>
                      edit({
                        title: "Edit farmer profile",
                        action: {
                          action: "profile.update",
                          version: data.profileVersion,
                        },
                        fields: [
                          {
                            key: "name",
                            title: "Name",
                            value: data.name,
                            max: 80,
                          },
                          {
                            key: "location",
                            title: "Location",
                            value: data.city,
                            max: 160,
                          },
                        ],
                      })
                    }
                  >
                    Edit profile
                  </Button>
                  <Button variant="outline" onClick={() => setTab("Profile")}>
                    Account actions
                  </Button>
                </>
              )}
            </div>
          </header>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              [Sprout, data.cropCount, "Crops"],
              [Leaf, data.plantCount, "Plants"],
              [FileText, data.reportCount, "Reports"],
              [
                Activity,
                owner
                  ? data.farmer?.online
                    ? "Active now"
                    : date(
                        data.farmer?.lastSeenAt ||
                          data.farmer?.lastSignInAt ||
                          null,
                      )
                  : "View only",
                owner ? "Last active" : "Community access",
              ],
            ].map(([Icon, value, title]) => {
              const I = Icon as typeof Sprout;
              return (
                <div
                  key={String(title)}
                  className={`${farmCard} flex items-center gap-3 !p-4`}
                >
                  <span className="rounded-full bg-emerald-50 p-3 text-emerald-700">
                    <I size={22} />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">{String(title)}</p>
                    <p
                      className={`mt-1 font-semibold ${typeof value === "number" ? "text-2xl" : "text-sm"}`}
                    >
                      {String(value)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="flex gap-1 overflow-x-auto border-b border-slate-200"
            role="tablist"
            aria-label="Farmer account sections"
          >
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${tab === t ? "border-emerald-700 font-semibold text-emerald-800" : "border-transparent text-slate-500 hover:text-emerald-800"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <main className="min-w-0 space-y-5">
              {(tab === "Crops & plants" ||
                tab === "Progress" ||
                tab === "Care history") && (
                <section className={farmCard}>
                  <h2 className="text-xl font-semibold">{tab}</h2>
                  <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                    {data.crops.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCropId(c.id)}
                        className={`min-w-[150px] rounded-xl border p-4 text-left ${cropId === c.id ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}
                      >
                        <Sprout size={19} className="text-emerald-700" />
                        <span className="mt-2 block font-medium">{c.name}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {c.plantCount} plants
                        </span>
                      </button>
                    ))}
                  </div>
                  {data.hasMoreCrops && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void more("crops")}
                    >
                      Load more crops
                    </Button>
                  )}
                  {!data.crops.length && (
                    <Empty>
                      No crops saved yet. Standalone diagnoses are available in
                      Reports.
                    </Empty>
                  )}
                  {crop && (
                    <>
                      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t pt-5">
                        <div>
                          <h3 className="text-xl font-semibold">{crop.name}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Added {date(crop.createdAt)}
                          </p>
                          {crop.notes && (
                            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                              {crop.notes}
                            </p>
                          )}
                        </div>
                        {owner && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editCrop(crop)}
                            >
                              Edit crop
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() =>
                                confirm({
                                  title: `Delete ${crop.name}?`,
                                  description:
                                    "The crop, its plants and all linked reports will be permanently removed.",
                                  action: {
                                    action: "crop.delete",
                                    cropId: crop.id,
                                    version: crop.version,
                                  },
                                  match: crop.name,
                                })
                              }
                            >
                              Delete crop
                            </Button>
                          </div>
                        )}
                      </div>
                      <h4 className="mt-6 font-semibold">
                        Plants in this crop
                      </h4>
                      {plantsLoading && !plants.length && (
                        <p role="status" className="mt-3 text-sm">
                          Loading plants…
                        </p>
                      )}
                      <div className="mt-3 space-y-3">
                        {plants.map((p) => (
                          <article
                            key={p.id}
                            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${p.id === plantId ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200"}`}
                          >
                            <Photo src={p.image} name={p.name} />
                            <div className="min-w-[100px] flex-1">
                              <h5 className="font-semibold">{p.name}</h5>
                              <p className="mt-1 text-xs text-slate-500">
                                {p.age || "Age not recorded"} · {p.recordCount}{" "}
                                records
                              </p>
                              <p className="mt-1 text-xs text-emerald-800">
                                {p.latestDisease || "No completed diagnosis"}
                              </p>
                              {p.notes && (
                                <p className="mt-2 text-xs text-slate-500">
                                  {p.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPlantId(p.id)}
                              >
                                {plantId === p.id
                                  ? "Viewing plant"
                                  : "Open plant"}
                              </Button>
                              {owner && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => editPlant(p)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9 text-red-600"
                                    aria-label={`Delete plant ${p.name}`}
                                    onClick={() =>
                                      confirm({
                                        title: `Delete ${p.name}?`,
                                        description:
                                          "This plant and all its diagnosis reports will be permanently removed.",
                                        action: {
                                          action: "plant.delete",
                                          cropId: p.cropId,
                                          plantId: p.id,
                                          version: p.version,
                                        },
                                        match: p.name,
                                      })
                                    }
                                  >
                                    <Trash2 size={15} />
                                  </Button>
                                </>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                      {!plantsLoading && !plants.length && (
                        <div className="mt-3">
                          <Empty>No plants saved in this crop.</Empty>
                        </div>
                      )}
                      {plantsMore && (
                        <Button
                          className="mt-3"
                          disabled={plantsLoading}
                          variant="outline"
                          onClick={() => void loadPlants(plants.at(-1)?.id)}
                        >
                          Load more plants
                        </Button>
                      )}
                      {plant && (
                        <div className="mt-6 space-y-4 border-t pt-5">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {plant.name} · Reports & progress
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              Compare saved scans of this same plant over time.
                            </p>
                          </div>
                          {recordsLoading && !records.length && (
                            <p role="status">Loading plant history…</p>
                          )}
                          {earlier && latest && earlier.id !== latest.id ? (
                            <>
                              <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                  [
                                    "Earlier report",
                                    earlier,
                                    beforeId,
                                    setBeforeId,
                                  ],
                                  [
                                    "Latest report",
                                    latest,
                                    afterId,
                                    setAfterId,
                                  ],
                                ].map(([title, r, chosen, choose]) => {
                                  const item = r as FarmReport;
                                  return (
                                    <article
                                      key={String(title)}
                                      className="space-y-3 rounded-xl border border-emerald-100 p-4"
                                    >
                                      <Label>{String(title)}</Label>
                                      <select
                                        aria-label={`Choose ${String(title).toLowerCase()}`}
                                        className="w-full rounded-lg border bg-white p-2 text-xs"
                                        value={String(chosen) || item.id}
                                        onChange={(e) =>
                                          (choose as (id: string) => void)(
                                            e.target.value,
                                          )
                                        }
                                      >
                                        {complete.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {date(c.createdAt)} · {c.disease}
                                          </option>
                                        ))}
                                      </select>
                                      <Photo
                                        src={item.image}
                                        name={String(title)}
                                        large
                                      />
                                      <h4 className="font-semibold">
                                        {item.disease}
                                      </h4>
                                      <p className="text-sm text-slate-500">
                                        Saved severity:{" "}
                                        {item.severity || "Not recorded"}
                                      </p>
                                      {item.progress && (
                                        <p className="text-sm text-emerald-800">
                                          Recorded progress: {item.progress}
                                        </p>
                                      )}
                                      <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => void openReport(item.id)}
                                      >
                                        Open full report
                                      </Button>
                                    </article>
                                  );
                                })}
                              </div>
                              <p className="text-xs leading-5 text-slate-500">
                                These are saved diagnoses and progress notes for
                                the same plant. Improvement is not assumed from
                                dates or images alone.
                              </p>
                            </>
                          ) : (
                            !recordsLoading && (
                              <Empty>
                                {complete.length === 1
                                  ? "One completed scan is available. A second scan of this plant is needed for comparison."
                                  : "No completed plant scans available for comparison."}
                              </Empty>
                            )
                          )}
                          <h4 className="font-semibold">
                            Care & diagnosis timeline
                          </h4>
                          {records.map((r) => (
                            <article
                              key={r.id}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <div className="flex flex-wrap justify-between gap-3">
                                <div>
                                  <p className="text-xs text-slate-500">
                                    {date(r.createdAt)}
                                  </p>
                                  <h5 className="mt-1 font-medium">
                                    {r.disease || r.status}
                                  </h5>
                                  <p className="mt-1 text-sm text-emerald-700">
                                    {r.progress || r.status}
                                  </p>
                                  {r.careNotes && (
                                    <p className="mt-2 whitespace-pre-line text-sm">
                                      {r.careNotes}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openReport(r.id)}
                                >
                                  Open full report
                                </Button>
                              </div>
                            </article>
                          ))}
                          {recordsMore && (
                            <Button
                              variant="outline"
                              disabled={recordsLoading}
                              onClick={() => void loadRecords(recordCursor)}
                            >
                              Load older records
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
              {tab === "Reports" && (
                <section className={`${farmCard} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">
                      All diagnosis reports
                    </h2>
                    <Input
                      className="max-w-xs"
                      aria-label="Search reports"
                      placeholder="Search crop, plant or diagnosis"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {reports.map((r) => (
                    <article
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div>
                        <p className="text-xs text-emerald-700">
                          {r.crop} · {r.plantName || "Standalone report"}
                        </p>
                        <h3 className="mt-1 font-semibold">
                          {r.disease || "Diagnosis in progress"}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {date(r.createdAt)} · {r.status}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openReport(r.id)}
                      >
                        Open full report
                      </Button>
                    </article>
                  ))}
                  {!reports.length && <Empty>No reports found.</Empty>}
                  {data.hasMoreReports && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void more("workspace-reports")}
                    >
                      Load older reports
                    </Button>
                  )}
                </section>
              )}
              {owner && tab === "Overview" && (
                <section className={`${farmCard} space-y-5`}>
                  <h2 className="text-xl font-semibold">Account overview</h2>
                  <p className="text-sm text-slate-600">
                    Browse this farmer’s crops, plant scans, care plans,
                    marketplace records and account settings using the tabs
                    above.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setTab("Crops & plants")}
                    >
                      Open crops & plants
                    </Button>
                    <Button variant="outline" onClick={() => setTab("Reports")}>
                      Open reports
                    </Button>
                  </div>
                  <RecordCollection
                    resource="fields"
                    api={scoped}
                    revision={revision}
                    onEdit={editRecord}
                    onDelete={removeRecord}
                  />
                </section>
              )}
              {owner && tab === "Marketplace" && (
                <div className={`${farmCard} space-y-8`}>
                  {(["marketplace", "contacts", "ratings"] as const).map(
                    (resource) => (
                      <RecordCollection
                        key={resource}
                        resource={resource}
                        api={scoped}
                        revision={revision}
                        onEdit={editRecord}
                        onDelete={removeRecord}
                      />
                    ),
                  )}
                </div>
              )}
              {owner && tab === "Community" && (
                <section className={`${farmCard} space-y-4`}>
                  <h2 className="text-xl font-semibold">Community sharing</h2>
                  <p className="text-sm">
                    This farmer’s sharing is{" "}
                    <strong>{data.sharing ? "ON" : "OFF"}</strong>.
                  </p>
                  <p className="text-sm text-slate-500">
                    When enabled by the farmer, their crops, plant images,
                    reports and care progress are visible to signed-in farmers.
                    Contact and account details remain private.
                  </p>
                  {data.sharing && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        confirm({
                          title: "Hide this shared profile?",
                          description:
                            "Other farmers will lose access to this farmer’s shared crop information. Their private records will remain.",
                          action: { action: "community.hide" },
                        })
                      }
                    >
                      Hide shared profile
                    </Button>
                  )}
                  <p className="text-xs text-slate-500">
                    Only the farmer can opt in to sharing. Owner access to their
                    account remains available.
                  </p>
                </section>
              )}
              {owner && tab === "Profile" && (
                <section className={`${farmCard} space-y-5`}>
                  <h2 className="text-xl font-semibold">
                    Profile & account settings
                  </h2>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["Name", data.name],
                      ["Location", data.city],
                      ["Email", data.farmer?.email],
                      ["Phone", data.farmer?.phone],
                      ["Joined", date(data.farmer?.createdAt || null)],
                      ["Last sign-in", date(data.farmer?.lastSignInAt || null)],
                      ["Language", data.preferences?.language],
                      ["Crop interests", data.preferences?.crops.join(", ")],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-slate-500">{k}</dt>
                        <dd className="mt-1 break-words text-sm">
                          {v || "Not set"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {data.preferences && (
                    <>
                      <div className="grid gap-2 text-sm">
                        {(
                          [
                            "weatherAlerts",
                            "priceUpdates",
                            "treatmentReminders",
                          ] as const
                        ).map((k) => (
                          <p key={k}>
                            {label(k)}: {data.preferences![k] ? "On" : "Off"}
                          </p>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          edit({
                            title: "Edit account preferences",
                            action: {
                              action: "preferences.update",
                              version: data.profileVersion,
                            },
                            fields: [
                              {
                                key: "language",
                                title: "Language",
                                value: data.preferences!.language,
                                type: "select",
                                options: ["english", "urdu"],
                              },
                              {
                                key: "crops",
                                title: "Crop interests (comma separated)",
                                value: data.preferences!.crops.join(", "),
                                max: 1500,
                              },
                              ...(
                                [
                                  "weatherAlerts",
                                  "priceUpdates",
                                  "treatmentReminders",
                                ] as const
                              ).map((k) => ({
                                key: k,
                                title: label(k),
                                value: data.preferences![k],
                                type: "checkbox" as const,
                              })),
                            ],
                          })
                        }
                      >
                        Edit preferences
                      </Button>
                    </>
                  )}
                  {data.farmer?.protected ? (
                    <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                      The owner account is protected from suspension and
                      deletion.
                    </p>
                  ) : (
                    <div className="space-y-3 border-t pt-5">
                      <h3 className="font-semibold">Account actions</h3>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={() =>
                            confirm({
                              title: data.farmer?.disabled
                                ? "Restore account?"
                                : "Suspend account?",
                              description: data.farmer?.disabled
                                ? "Allow this farmer to sign in again."
                                : "The farmer will be signed out and blocked from signing in until restored.",
                              action: {
                                action: data.farmer?.disabled
                                  ? "account.restore"
                                  : "account.suspend",
                              },
                            })
                          }
                        >
                          {data.farmer?.disabled
                            ? "Restore account"
                            : "Suspend account"}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() =>
                            confirm({
                              title: "Permanently delete account?",
                              description:
                                "This deletes this farmer’s account, crops, plant reports, shared information and marketplace records. This cannot be undone.",
                              action: { action: "account.delete" },
                              match:
                                data.farmer?.email || data.farmer?.phone || uid,
                            })
                          }
                        >
                          Delete account
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {owner && tab === "Activity" && (
                <section className={`${farmCard} space-y-7`}>
                  <h2 className="text-xl font-semibold">
                    Saved account activity
                  </h2>
                  <RecordCollection
                    resource="logs"
                    api={scoped}
                    revision={revision}
                    onEdit={editRecord}
                    onDelete={removeRecord}
                  />
                  <RecordCollection
                    resource="notifications"
                    api={scoped}
                    revision={revision}
                    onEdit={editRecord}
                    onDelete={removeRecord}
                  />
                  <h3 className="font-semibold">Owner change history</h3>
                  {data.ownerActivity.map((a) => (
                    <div key={a.id} className="rounded-xl border p-3 text-sm">
                      <p>
                        {a.action.replaceAll(".", " · ")} · {a.status}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {date(a.createdAt)}
                      </p>
                    </div>
                  ))}
                </section>
              )}
            </main>
            <aside className="space-y-4">
              {owner ? (
                <>
                  <section className={farmCard}>
                    <h2 className="flex items-center gap-2 font-semibold">
                      <Activity size={18} className="text-emerald-700" />
                      Farmer activity
                    </h2>
                    <div className="mt-4 space-y-4">
                      {data.activity.slice(0, 6).map((a) => (
                        <div
                          key={a.id}
                          className="border-l-2 border-emerald-100 pl-3"
                        >
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {date(a.date)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {a.detail}
                          </p>
                        </div>
                      ))}
                      {!data.activity.length && (
                        <p className="text-sm text-slate-500">
                          No saved crop activity yet.
                        </p>
                      )}
                    </div>
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("Activity")}
                    >
                      View account activity
                    </Button>
                  </section>
                  <section className={`${farmCard} space-y-3`}>
                    <h2 className="font-semibold">Owner controls</h2>
                    {[
                      ["Profile", "Edit account details"],
                      ["Community", "Manage shared information"],
                      ["Marketplace", "Manage marketplace records"],
                    ].map(([target, title]) => (
                      <button
                        key={target}
                        className="block w-full border-b border-slate-100 py-2 text-left text-sm text-slate-600 hover:text-emerald-700"
                        onClick={() => setTab(target)}
                      >
                        {title}
                      </button>
                    ))}
                    <p className="flex gap-2 text-xs leading-5 text-slate-500">
                      <ShieldCheck
                        size={16}
                        className="shrink-0 text-emerald-600"
                      />
                      Owner changes are recorded in activity history.
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <section className={farmCard}>
                    <h2 className="font-semibold">What others can see</h2>
                    <ul className="mt-4 space-y-4">
                      {[
                        "Name & city",
                        "Crops & plants",
                        "Plant images & full reports",
                        "Care history",
                        "Progress over time",
                      ].map((t) => (
                        <li
                          key={t}
                          className="flex gap-2 text-sm text-slate-600"
                        >
                          <CheckCircle2
                            size={17}
                            className="shrink-0 text-emerald-700"
                          />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className={`${farmCard} space-y-3`}>
                    <h2 className="flex gap-2 font-semibold">
                      <LockKeyhole size={18} />
                      Stays private
                    </h2>
                    <p className="text-sm leading-6 text-slate-500">
                      Phone, email, exact address and login details.
                    </p>
                    <hr />
                    <h3 className="font-medium">View access only</h3>
                    <p className="text-sm leading-6 text-slate-500">
                      Other farmers cannot edit or delete these records.
                    </p>
                  </section>
                </>
              )}
            </aside>
          </div>
        </>
      )}
      <Dialog
        open={Boolean(report) || reportLoading}
        onOpenChange={(open) => {
          if (!open) {
            reportSeq.current++;
            setReport(null);
            setReportLoading(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Full diagnosis report</DialogTitle>
            <DialogDescription>
              {owner
                ? "Saved report, care plan and changes for this farmer."
                : "Shared by the farmer. Read-only report and care history."}
            </DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <p role="status">Opening report…</p>
          ) : (
            report && (
              <>
                {owner && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => editReport(report)}
                    >
                      Edit report & progress
                    </Button>
                    {report.plan && (
                      <Button
                        variant="outline"
                        onClick={() => editPlan(report)}
                      >
                        Edit care plan
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="text-red-600"
                      onClick={() => {
                        setReport(null);
                        confirm({
                          title: "Delete this report?",
                          description:
                            "This removes the diagnosis and linked plant record. Other scans remain.",
                          action: {
                            action: "report.delete",
                            reportId: report.id,
                            version: report.version,
                          },
                          match: report.disease || report.id,
                        });
                      }}
                    >
                      Delete report
                    </Button>
                  </div>
                )}
                <ReportContent report={report} />
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.title}</DialogTitle>
            <DialogDescription>
              Changes apply to this farmer’s saved account and are recorded in
              owner history.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                let values: Record<string, unknown> = Object.fromEntries(
                  editor.fields.map((f) => [f.key, f.value]),
                );
                if (editor.action.action === "preferences.update")
                  values.crops = String(values.crops)
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean);
                if (editor.plan) {
                  const plan = {
                    timeline: String(values.timeline),
                    totalCost: Number(values.totalCost),
                    preventionTips: String(values.preventionTips)
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                    steps: editor.plan.steps.map((step, i) => ({
                      title: String(values[`step_${i}_title`]),
                      description: String(values[`step_${i}_description`]),
                      timing: String(values[`step_${i}_timing`]),
                      materials: String(values[`step_${i}_materials`])
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                      cost: Number(values[`step_${i}_cost`]),
                      safetyNotes: String(values[`step_${i}_safetyNotes`]),
                    })),
                  };
                  void mutate({ ...editor.action, plan });
                } else
                  void mutate({
                    ...editor.action,
                    ...(editor.nested ? { values } : values),
                  });
              }}
            >
              <fieldset disabled={busy} className="space-y-4">
                {editor.fields.map((f, i) => (
                  <div key={f.key}>
                    <Label htmlFor={`farm-edit-${f.key}`}>{f.title}</Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        id={`farm-edit-${f.key}`}
                        maxLength={f.max}
                        value={String(f.value)}
                        onChange={(e) =>
                          setEditor((old) =>
                            old
                              ? {
                                  ...old,
                                  fields: old.fields.map((field, j) =>
                                    j === i
                                      ? { ...field, value: e.target.value }
                                      : field,
                                  ),
                                }
                              : old,
                          )
                        }
                      />
                    ) : f.type === "select" ? (
                      <select
                        id={`farm-edit-${f.key}`}
                        className="mt-1 w-full rounded-md border bg-white p-2 text-sm"
                        value={String(f.value)}
                        onChange={(e) =>
                          setEditor((old) =>
                            old
                              ? {
                                  ...old,
                                  fields: old.fields.map((field, j) =>
                                    j === i
                                      ? { ...field, value: e.target.value }
                                      : field,
                                  ),
                                }
                              : old,
                          )
                        }
                      >
                        {f.options?.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : f.type === "checkbox" ? (
                      <input
                        id={`farm-edit-${f.key}`}
                        type="checkbox"
                        className="ml-3"
                        checked={Boolean(f.value)}
                        onChange={(e) =>
                          setEditor((old) =>
                            old
                              ? {
                                  ...old,
                                  fields: old.fields.map((field, j) =>
                                    j === i
                                      ? { ...field, value: e.target.checked }
                                      : field,
                                  ),
                                }
                              : old,
                          )
                        }
                      />
                    ) : (
                      <Input
                        id={`farm-edit-${f.key}`}
                        type={f.type === "number" ? "number" : "text"}
                        step="any"
                        maxLength={f.max}
                        value={String(f.value)}
                        onChange={(e) =>
                          setEditor((old) =>
                            old
                              ? {
                                  ...old,
                                  fields: old.fields.map((field, j) =>
                                    j === i
                                      ? {
                                          ...field,
                                          value:
                                            f.type === "number"
                                              ? Number(e.target.value)
                                              : e.target.value,
                                        }
                                      : field,
                                  ),
                                }
                              : old,
                          )
                        }
                      />
                    )}
                  </div>
                ))}
              </fieldset>
              {dialogError && (
                <p role="alert" className="text-sm text-red-700">
                  {dialogError}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          {confirmation?.match && (
            <div className="space-y-2">
              <Label htmlFor="farm-confirm">
                Type “{confirmation.match}” to confirm
              </Label>
              <Input
                id="farm-confirm"
                autoComplete="off"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
              />
            </div>
          )}
          {dialogError && (
            <p role="alert" className="text-sm text-red-700">
              {dialogError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                Boolean(
                  confirmation?.match &&
                    confirmationText !== confirmation.match,
                )
              }
              onClick={() =>
                confirmation &&
                void mutate({
                  ...confirmation.action,
                  ...(confirmation.match
                    ? { confirmation: confirmationText }
                    : {}),
                })
              }
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
