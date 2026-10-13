import { z } from "zod";

export const careId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "Invalid text.",
    );
const name = (n: number) => text(n).refine(Boolean, "This field is required.");
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) && new Date(v).toISOString().startsWith(v),
    "Choose a valid date.",
  );
export const outcomes = [
  "Not yet checked",
  "Improved",
  "No change",
  "Worsened",
] as const;
export const seasonInput = z
  .object({
    crop: name(64),
    cropId: careId.optional(),
    field: name(100),
    plantId: careId.optional(),
    label: name(64),
    startedOn: day,
    endedOn: day.optional(),
    status: z.enum(["active", "completed"]),
  })
  .strict()
  .refine(
    (v) => !v.endedOn || v.endedOn >= v.startedOn,
    "End date must follow the planting date.",
  )
  .refine(
    (v) => v.status !== "completed" || Boolean(v.endedOn),
    "Add the harvest/end date.",
  );
const photo = z
  .string()
  .max(100000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
  .optional();
export const careAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("season.create"),
      requestId: careId,
      season: seasonInput,
      reportId: careId.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("season.update"),
      seasonId: careId,
      version: name(100),
      season: seasonInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("report.link"),
      reportId: careId,
      seasonId: careId,
    })
    .strict(),
  z
    .object({
      action: z.literal("report.unlink"),
      reportId: careId,
      seasonId: careId,
    })
    .strict(),
  z
    .object({
      action: z.literal("event.add"),
      requestId: careId,
      seasonId: careId,
      reportId: careId,
      kind: z.enum(["planned", "applied", "followup"]),
      treatmentId: careId.optional(),
      product: text(160).default(""),
      category: z
        .enum(["pesticide", "cultural", "biological", "monitoring", "other"])
        .default("pesticide"),
      occurredOn: day,
      notes: text(2000).default(""),
      outcome: z.enum(outcomes).default("Not yet checked"),
      stepIndex: z.number().int().min(0).max(39).optional(),
      image: photo,
      followupReportId: careId.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("event.void"),
      seasonId: careId,
      eventId: careId,
      version: name(100),
      reason: name(300),
    })
    .strict(),
]);
export type CareAction = z.infer<typeof careAction>;
export type SeasonInput = z.infer<typeof seasonInput>;
export type CareSeason = SeasonInput & {
  id: string;
  version: string;
  cropKey: string;
  createdAt: string;
  updatedAt: string;
  reportCount: number;
};
export type CareReport = {
  id: string;
  crop: string;
  disease: string;
  severity: string;
  confidence: number | null;
  expertReviewRequired: boolean;
  status: string;
  createdAt: string;
  careSeasonId: string;
  cropId: string;
  plantId: string;
  fieldId: string;
  description?: string;
  image?: string;
  plan?: {
    steps: {
      title: string;
      description: string;
      materials: string[];
      timing: string;
      safetyNotes: string;
    }[];
    preventionTips: string[];
  };
};
export type CareEvent = {
  id: string;
  version: string;
  reportId: string;
  kind: "planned" | "applied" | "followup";
  treatmentId: string;
  product: string;
  category: string;
  occurredOn: string;
  createdAt: string;
  notes: string;
  outcome: (typeof outcomes)[number];
  hasImage: boolean;
  suggestion: {
    title: string;
    materials: string[];
    source: "AI suggestion";
    verifiedProduct: false;
  } | null;
  followupReportId: string;
  voidedAt: string;
  voidReason: string;
  image?: string;
};
export type CarePage<T> = { items: T[]; nextCursor: string | null };
export type HistoricalMatch = {
  report: CareReport;
  season: CareSeason | null;
  match: "same" | "similar";
  explanation: string;
  treatments: CareEvent[];
  moreCareAvailable: boolean;
  fieldRelation: "same" | "different" | "unknown";
};
export type HistoryResult = {
  current: CareReport;
  season: CareSeason | null;
  matches: HistoricalMatch[];
  previousCount: number;
  unassignedCount: number;
  nextCursor: string | null;
};
export function cropKey(value: string): string {
  const key = value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    corn: "maize",
    "sweet corn": "maize",
    گندم: "wheat",
    مکئی: "maize",
    آم: "mango",
    ٹماٹر: "tomato",
    چاول: "rice",
    کپاس: "cotton",
    آلو: "potato",
    گنا: "sugarcane",
  };
  return aliases[key] || key;
}
export function cropNames(value: string): string[] {
  const key = cropKey(value);
  const aliases: Record<string, string[]> = {
    wheat: ["گندم"],
    maize: ["Corn", "corn", "مکئی"],
    mango: ["آم"],
    tomato: ["ٹماٹر"],
    rice: ["چاول"],
    cotton: ["کپاس"],
    potato: ["آلو"],
    sugarcane: ["گنا"],
  };
  return [
    ...new Set([
      value.trim(),
      key,
      key.replace(/\b\w/g, (c) => c.toUpperCase()),
      ...(aliases[key] || []),
    ]),
  ].slice(0, 10);
}
export function reportFitsSeason(
  report: CareReport,
  season: SeasonInput,
): string | null {
  if (report.status !== "Complete")
    return "Wait for the diagnosis to finish before linking it.";
  if (cropKey(report.crop) !== cropKey(season.crop))
    return "Choose a season for the same crop as this diagnosis.";
  const date = report.createdAt.slice(0, 10);
  if (
    !date ||
    date < season.startedOn ||
    (season.endedOn && date > season.endedOn)
  )
    return "This report is outside the season dates. Choose the correct crop cycle or create a new one.";
  if (season.cropId && report.cropId && season.cropId !== report.cropId)
    return "This report belongs to a different crop record.";
  if (season.plantId && report.plantId && season.plantId !== report.plantId)
    return "This report belongs to a different plant.";
  return null;
}
function diagnosisKey(value: string): string {
  const key = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /\b(suspected|possible|probable|likely|infestation|infection|disease)\b/g,
      "",
    )
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    (
      {
        aphid: "aphids",
        "aphid attack": "aphids",
        whiteflies: "whitefly",
        "powdery mildew fungus": "powdery mildew",
        "early blight alternaria solani": "early blight",
      } as Record<string, string>
    )[key] || key
  );
}
/** Conservative label/known-alias comparison of saved diagnoses; no embeddings or invented clinical similarity. */
export function diseaseMatch(
  a: CareReport,
  b: CareReport,
): { match: "same" | "similar"; explanation: string } | null {
  if (
    cropKey(a.crop) !== cropKey(b.crop) ||
    a.status !== "Complete" ||
    b.status !== "Complete"
  )
    return null;
  const ak = diagnosisKey(a.disease),
    bk = diagnosisKey(b.disease);
  if (
    !ak ||
    !bk ||
    [a.disease, b.disease].some((v) =>
      /healthy|unknown|unidentified|not a crop|not a plant|صحت مند|نامعلوم/i.test(
        v,
      ),
    )
  )
    return null;
  if (ak !== bk) return null;
  const uncertain = [a, b].some(
    (r) =>
      r.expertReviewRequired ||
      r.confidence === null ||
      r.confidence < 70 ||
      /suspected|possible|probable|likely/i.test(r.disease),
  );
  return uncertain
    ? {
        match: "similar",
        explanation:
          "The saved diagnosis labels match, but uncertainty remains. This does not confirm the same cause.",
      }
    : {
        match: "same",
        explanation:
          "The same diagnosis label was saved in both reports. These are separate crop checks, not proof of the same outbreak.",
      };
}
export function latestOutcome(
  events: CareEvent[],
  treatmentId: string,
): CareEvent | undefined {
  return events
    .filter(
      (e) =>
        !e.voidedAt && e.kind === "followup" && e.treatmentId === treatmentId,
    )
    .sort(
      (a, b) =>
        b.occurredOn.localeCompare(a.occurredOn) ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
}
