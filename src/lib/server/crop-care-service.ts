import { createHash } from "node:crypto";
import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { adminServices, OwnerError } from "./owner-auth";
import {
  careDay,
  cropKey,
  cropNames,
  diseaseMatch,
  reportFitsSeason,
  type CareAction,
  type CareSeason,
  type CareReport,
  type CareEvent,
  type SeasonInput,
} from "../crop-care/models";
import { dateValue, recordVersion } from "./farmer-workspace-service";
type Services = ReturnType<typeof adminServices>;
const clean = (v: unknown, n = 2000) =>
  typeof v === "string" ? v.slice(0, n) : "";
const reportFields = [
  "crop",
  "disease",
  "severity",
  "confidence",
  "expertReviewRequired",
  "status",
  "createdAt",
  "careSeasonId",
  "cropId",
  "plantId",
  "fieldId",
];
const eventFields = [
  "reportId",
  "kind",
  "treatmentId",
  "product",
  "category",
  "occurredOn",
  "createdAt",
  "notes",
  "outcome",
  "hasImage",
  "suggestion",
  "followupReportId",
  "voidedAt",
  "voidReason",
];
const root = (s: Services, uid: string) =>
  s.db.collection(`users/${uid}/careSeasons`);
function reportView(doc: DocumentSnapshot, full = false): CareReport {
  const d = doc.data() || {};
  return {
    id: doc.id,
    crop: clean(d.crop, 64),
    disease: clean(d.disease, 200),
    severity: clean(d.severity, 30),
    confidence: typeof d.confidence === "number" ? d.confidence : null,
    expertReviewRequired: Boolean(d.expertReviewRequired),
    status: clean(d.status, 30),
    createdAt: dateValue(d.createdAt) || "",
    careSeasonId: clean(d.careSeasonId, 128),
    cropId: clean(d.cropId, 128),
    plantId: clean(d.plantId, 128),
    fieldId: clean(d.fieldId, 128),
    ...(full
      ? {
          description: clean(d.description, 6000),
          image: /^data:image\/(jpeg|png|webp);base64,/.test(d.imageThumb || "")
            ? clean(d.imageThumb, 100000)
            : "",
          plan: d.plan
            ? {
                steps: (Array.isArray(d.plan.steps) ? d.plan.steps : [])
                  .slice(0, 40)
                  .map((v: any) => ({
                    title: clean(v.title, 200),
                    description: clean(v.description, 4000),
                    materials: (Array.isArray(v.materials) ? v.materials : [])
                      .slice(0, 20)
                      .map((m: any) => clean(m, 200)),
                    timing: clean(v.timing, 500),
                    safetyNotes: clean(v.safetyNotes, 2000),
                  })),
                preventionTips: (Array.isArray(d.plan.preventionTips)
                  ? d.plan.preventionTips
                  : []
                )
                  .slice(0, 20)
                  .map((v: any) => clean(v, 1000)),
              }
            : undefined,
        }
      : {}),
  };
}
function seasonView(doc: DocumentSnapshot, shared = false): CareSeason {
  const d = doc.data() || {};
  return {
    id: doc.id,
    version: recordVersion(doc),
    crop: clean(d.crop, 64),
    cropKey: clean(d.cropKey, 64),
    cropId: clean(d.cropId, 128),
    field: shared ? "Shared growing area" : clean(d.field, 100),
    ...(d.plantId ? { plantId: clean(d.plantId, 128) } : {}),
    label: clean(d.label, 64),
    startedOn: clean(d.startedOn, 10),
    ...(d.endedOn ? { endedOn: clean(d.endedOn, 10) } : {}),
    status: d.status === "completed" ? "completed" : "active",
    createdAt: dateValue(d.createdAt) || "",
    updatedAt: dateValue(d.updatedAt) || "",
    reportCount: 0,
  };
}
function eventView(doc: DocumentSnapshot): CareEvent {
  const d = doc.data() || {},
    p = d.suggestion;
  return {
    id: doc.id,
    version: recordVersion(doc),
    reportId: clean(d.reportId, 128),
    kind: d.kind,
    treatmentId: clean(d.treatmentId, 128),
    product: clean(d.product, 160),
    category: clean(d.category, 30),
    occurredOn: clean(d.occurredOn, 10),
    createdAt: dateValue(d.createdAt) || "",
    notes: clean(d.notes),
    outcome: ["Improved", "No change", "Worsened"].includes(d.outcome)
      ? d.outcome
      : "Not yet checked",
    hasImage: Boolean(d.hasImage),
    suggestion: p
      ? {
          title: clean(p.title, 200),
          materials: (Array.isArray(p.materials) ? p.materials : [])
            .slice(0, 20)
            .map((m: any) => clean(m, 200)),
          source: "AI suggestion",
          verifiedProduct: false,
        }
      : null,
    followupReportId: clean(d.followupReportId, 128),
    voidedAt: clean(d.voidedAt, 40),
    voidReason: clean(d.voidReason, 300),
  };
}
async function page(q: Query, cursor: string | undefined, size: number) {
  let query = q.orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const docs = (await query.limit(size + 1).get()).docs;
  return {
    docs: docs.slice(0, size),
    nextCursor: docs.length > size ? docs[size - 1].id : null,
  };
}
async function getSeason(s: Services, uid: string, id: string, shared = false) {
  const snap = await root(s, uid).doc(id).get();
  if (!snap.exists || snap.data()?.deletingAt)
    throw new OwnerError("Care record not found.", 404);
  const season = seasonView(snap, shared);
  const crop = await s.db.doc(`users/${uid}/crops/${season.cropId}`).get();
  if (!crop.exists || crop.data()?.deletingAt)
    throw new OwnerError("This crop is unavailable.", 404);
  return season;
}
export async function careRead(
  s: Services,
  uid: string,
  p: URLSearchParams,
  shared = false,
): Promise<unknown> {
  const resource = p.get("resource") || "seasons",
    seasonId = p.get("seasonId") || "",
    cursor = p.get("cursor") || undefined;
  if (resource === "seasons") {
    let q: Query = root(s, uid);
    if (p.get("crop")) q = q.where("cropKey", "==", cropKey(p.get("crop")!));
    const result = await page(q, cursor, 40);
    return {
      items: result.docs
        .filter((d) => !d.data().deletingAt)
        .map((d) => seasonView(d, shared)),
      nextCursor: result.nextCursor,
    };
  }
  if (resource === "context") {
    const report = (await careRead(
      s,
      uid,
      new URLSearchParams({ resource: "report", reportId: p.get("reportId")! }),
      shared,
    )) as CareReport;
    const [seasons, season] = await Promise.all([
      careRead(
        s,
        uid,
        new URLSearchParams({ resource: "seasons", crop: report.crop }),
        shared,
      ),
      report.careSeasonId
        ? getSeason(s, uid, report.careSeasonId, shared)
        : null,
    ]);
    return { report, seasons, season };
  }
  if (resource === "season-detail") {
    const [season, reports, events] = await Promise.all(
      ["season", "reports", "events"].map((resource) =>
        careRead(s, uid, new URLSearchParams({ resource, seasonId }), shared),
      ),
    );
    return { season, reports, events };
  }
  if (resource === "report") {
    const d = await s.db.doc(`users/${uid}/reports/${p.get("reportId")}`).get();
    if (!d.exists) throw new OwnerError("Report not found.", 404);
    return reportView(d, true);
  }
  if (resource === "history")
    return careHistory(s, uid, p.get("reportId")!, cursor, shared);
  const season = await getSeason(s, uid, seasonId, shared);
  if (resource === "season") return season;
  if (resource === "reports") {
    const result = await page(
      s.db
        .collection(`users/${uid}/reports`)
        .where("careSeasonId", "==", seasonId)
        .select(...reportFields),
      cursor,
      30,
    );
    return {
      items: result.docs.map((d) => reportView(d)),
      nextCursor: result.nextCursor,
    };
  }
  if (resource === "events") {
    let q: Query = root(s, uid).doc(seasonId).collection("events");
    if (p.get("reportId")) q = q.where("reportId", "==", p.get("reportId"));
    const result = await page(q.select(...eventFields), cursor, 30);
    return { items: result.docs.map(eventView), nextCursor: result.nextCursor };
  }
  if (resource === "event-image") {
    const event = await root(s, uid)
      .doc(seasonId)
      .collection("events")
      .doc(p.get("eventId")!)
      .get();
    if (!event.exists || event.data()?.voidedAt)
      throw new OwnerError("Photo not found.", 404);
    const image = await root(s, uid)
      .doc(seasonId)
      .collection("images")
      .doc(event.id)
      .get();
    return { image: clean(image.data()?.image, 100000) };
  }
  throw new OwnerError("Unknown care section.", 404);
}
export async function careHistory(
  s: Services,
  uid: string,
  reportId: string,
  cursor?: string,
  shared = false,
) {
  const doc = await s.db.doc(`users/${uid}/reports/${reportId}`).get();
  if (!doc.exists) throw new OwnerError("Report not found.", 404);
  const current = reportView(doc),
    season = current.careSeasonId
      ? await getSeason(s, uid, current.careSeasonId, shared)
      : null;
  if (!current.crop || current.status !== "Complete")
    return {
      current,
      season,
      matches: [],
      previousCount: 0,
      unassignedCount: 0,
      nextCursor: null,
    };
  // Metadata projection avoids downloading inference photos or loading the model. Native document-ID cursor needs no composite index.
  const scanned = await page(
    s.db
      .collection(`users/${uid}/reports`)
      .where("crop", "in", cropNames(current.crop))
      .select(...reportFields),
    cursor,
    30,
  );
  const earlier = scanned.docs
    .map((d) => reportView(d))
    .filter(
      (r) =>
        r.id !== current.id &&
        r.status === "Complete" &&
        r.createdAt &&
        r.createdAt < current.createdAt,
    );
  const candidates = earlier
    .map((report) => ({ report, match: diseaseMatch(current, report) }))
    .filter((v) => v.match && (!season || v.report.careSeasonId !== season.id))
    .sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
  const used = new Set<string>();
  const chosen = candidates.filter((v) => {
    const key = v.report.careSeasonId || v.report.id;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
  const matches = await Promise.all(
    chosen.map(async ({ report, match }) => {
      let previousSeason: CareSeason | null = null,
        treatments: CareEvent[] = [],
        moreCareAvailable = false;
      if (report.careSeasonId) {
        try {
          previousSeason = await getSeason(s, uid, report.careSeasonId, shared);
        } catch {
          return null;
        }
        // Overlapping cycles can be different fields in the same season, not previous seasons.
        if (season && previousSeason.startedOn >= season.startedOn) return null;
        const events = await root(s, uid)
          .doc(previousSeason.id)
          .collection("events")
          .where("reportId", "==", report.id)
          .select(...eventFields)
          .limit(51)
          .get();
        moreCareAvailable = events.size > 50;
        treatments = events.docs
          .slice(0, 50)
          .map(eventView)
          .filter((e) => !e.voidedAt)
          .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
      }
      return {
        report,
        season: previousSeason,
        ...match!,
        treatments,
        moreCareAvailable,
        fieldRelation:
          !season || !previousSeason
            ? "unknown"
            : shared
              ? "unknown"
              : season.field.toLowerCase() ===
                  previousSeason.field.toLowerCase()
                ? "same"
                : "different",
      };
    }),
  );
  return {
    current,
    season,
    matches: matches.filter(Boolean),
    previousCount: earlier.length,
    unassignedCount: earlier.filter((r) => !r.careSeasonId).length,
    nextCursor: scanned.nextCursor,
  };
}
async function lockedSeason(
  s: Services,
  uid: string,
  id: string,
  t: Transaction,
) {
  const ref = root(s, uid).doc(id),
    snap = await t.get(ref);
  if (!snap.exists || snap.data()?.deletingAt)
    throw new OwnerError("Care record not found.", 404);
  const season = seasonView(snap),
    crop = await t.get(s.db.doc(`users/${uid}/crops/${season.cropId}`));
  if (!crop.exists || crop.data()?.deletingAt)
    throw new OwnerError("This crop is unavailable.", 409);
  return { ref, snap, season };
}
function assertVersion(doc: DocumentSnapshot, version: string) {
  if (recordVersion(doc) !== version)
    throw new OwnerError("This record changed. Refresh before saving.", 409);
}
function assertLink(report: CareReport, season: SeasonInput, seasonId: string) {
  const error = reportFitsSeason(report, season);
  if (error) throw new OwnerError(error, 409);
  if (report.careSeasonId && report.careSeasonId !== seasonId)
    throw new OwnerError(
      "This report is already linked. Remove its existing link first.",
      409,
    );
}
export async function careWrite(
  s: Services,
  uid: string,
  actorUid: string,
  input: CareAction,
) {
  const now = new Date().toISOString(),
    today = careDay(now);
  const audit = s.db.collection(`users/${uid}/careAudit`).doc();
  const result = await s.db.runTransaction(async (t) => {
    // Account/crop locks are read in the same transaction as mutations, including cross-account owner writes.
    const control = await t.get(s.db.doc(`account_controls/${uid}`));
    if (control.data()?.disabled)
      throw new OwnerError("This account is unavailable.", 403);
    if (input.action === "season.create") {
      const seasonRef = root(s, uid).doc(input.requestId),
        existing = await t.get(seasonRef);
      if (existing.exists) return { seasonId: existing.id };
      const v = input.season,
        cId =
          v.cropId ||
          createHash("sha256")
            .update(
              v.crop
                .normalize("NFKC")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " "),
            )
            .digest("hex");
      const cropRef = s.db.doc(`users/${uid}/crops/${cId}`),
        crop = await t.get(cropRef);
      if (crop.data()?.deletingAt)
        throw new OwnerError("This crop is being deleted.", 409);
      if (crop.exists && cropKey(crop.data()?.name || "") !== cropKey(v.crop))
        throw new OwnerError("Choose the matching crop record.");
      if (v.plantId) {
        const plant = await t.get(cropRef.collection("plants").doc(v.plantId));
        if (!plant.exists || plant.data()?.deletingAt)
          throw new OwnerError("Plant not found.", 404);
      }
      const report = input.reportId
        ? await t.get(s.db.doc(`users/${uid}/reports/${input.reportId}`))
        : null;
      if (report) {
        if (!report.exists) throw new OwnerError("Report not found.", 404);
        assertLink(reportView(report), v, seasonRef.id);
      }
      if (v.startedOn > today || (v.endedOn && v.endedOn > today))
        throw new OwnerError("Planting date cannot be in the future.");
      const season = {
        ...v,
        cropId: cId,
        cropKey: cropKey(v.crop),
        createdAt: now,
        updatedAt: now,
      };
      if (!crop.exists)
        t.create(cropRef, {
          name: v.crop,
          nameKey: v.crop.toLowerCase(),
          plantCount: 0,
          nextPlantNumber: 1,
          createdAt: now,
          updatedAt: now,
        });
      t.create(seasonRef, season);
      if (report)
        t.update(report.ref, {
          careSeasonId: seasonRef.id,
          ...(!report.data()?.cropId ? { cropId: cId } : {}),
          updatedAt: now,
        });
      t.set(audit, {
        action: input.action,
        seasonId: seasonRef.id,
        actorUid,
        createdAt: now,
      });
      return { seasonId: seasonRef.id };
    }
    const { ref, snap, season } = await lockedSeason(s, uid, input.seasonId, t);
    if (input.action === "season.update") {
      assertVersion(snap, input.version);
      const v = input.season;
      if (
        cropKey(v.crop) !== season.cropKey ||
        v.cropId !== season.cropId ||
        v.plantId !== season.plantId
      )
        throw new OwnerError(
          "A season cannot be moved to another crop or plant.",
        );
      const reports = await t.get(
        s.db
          .collection(`users/${uid}/reports`)
          .where("careSeasonId", "==", season.id)
          .select(...reportFields),
      );
      for (const d of reports.docs) {
        const error = reportFitsSeason(reportView(d), v);
        if (error)
          throw new OwnerError(
            "These dates would exclude a linked report. Keep its capture date within this season.",
            409,
          );
      }
      if (v.startedOn > today || (v.endedOn && v.endedOn > today))
        throw new OwnerError("Use a date up to today.");
      t.update(ref, {
        ...v,
        endedOn: v.endedOn || FieldValue.delete(),
        updatedAt: now,
      });
    } else if (
      input.action === "report.link" ||
      input.action === "report.unlink"
    ) {
      const d = await t.get(s.db.doc(`users/${uid}/reports/${input.reportId}`));
      if (!d.exists) throw new OwnerError("Report not found.", 404);
      if (input.action === "report.link") {
        assertLink(reportView(d), season, season.id);
        t.update(d.ref, {
          careSeasonId: season.id,
          ...(!d.data()?.cropId ? { cropId: season.cropId } : {}),
          updatedAt: now,
        });
      } else {
        if (d.data()?.careSeasonId !== season.id)
          throw new OwnerError("This report is not linked here.", 409);
        const entries = await t.get(
          ref.collection("events").where("reportId", "==", d.id).limit(1),
        );
        if (!entries.empty)
          throw new OwnerError(
            "A report with a care history must remain linked to preserve that history.",
            409,
          );
        t.update(d.ref, { careSeasonId: FieldValue.delete(), updatedAt: now });
      }
    } else if (input.action === "event.add") {
      const eventRef = ref.collection("events").doc(input.requestId),
        existing = await t.get(eventRef);
      if (existing.exists) return { seasonId: season.id, eventId: existing.id };
      const d = await t.get(s.db.doc(`users/${uid}/reports/${input.reportId}`));
      if (!d.exists || d.data()?.careSeasonId !== season.id)
        throw new OwnerError("Link the diagnosis to this season first.", 409);
      if (d.data()?.status !== "Complete")
        throw new OwnerError("Wait for the diagnosis to finish.", 409);
      const report = reportView(d, true);
      if (
        input.occurredOn < season.startedOn ||
        input.occurredOn > today ||
        (season.endedOn && input.occurredOn > season.endedOn)
      )
        throw new OwnerError(
          "Choose a treatment/check date within this season, up to today.",
        );
      if (input.occurredOn < careDay(report.createdAt))
        throw new OwnerError(
          "A care entry for this diagnosis cannot predate its capture.",
        );
      if (input.kind === "followup") {
        if (!input.treatmentId)
          throw new OwnerError(
            "Choose the applied treatment being followed up.",
          );
        const treatment = await t.get(
          ref.collection("events").doc(input.treatmentId),
        );
        if (
          !treatment.exists ||
          treatment.data()?.kind !== "applied" ||
          treatment.data()?.voidedAt ||
          treatment.data()?.reportId !== input.reportId
        )
          throw new OwnerError(
            "Choose an active applied treatment for this diagnosis.",
          );
        if (input.occurredOn < treatment.data()!.occurredOn)
          throw new OwnerError("A follow-up cannot predate its treatment.");
      } else if (input.treatmentId)
        throw new OwnerError("Only a follow-up can reference a treatment.");
      if (input.kind !== "followup" && input.outcome !== "Not yet checked")
        throw new OwnerError(
          "Save outcomes through a follow-up, not as an application.",
        );
      if (input.followupReportId) {
        if (
          input.kind !== "followup" ||
          input.followupReportId === input.reportId
        )
          throw new OwnerError("Choose a separate follow-up diagnosis.");
        const follow = await t.get(
          s.db.doc(`users/${uid}/reports/${input.followupReportId}`),
        );
        if (
          !follow.exists ||
          follow.data()?.careSeasonId !== season.id ||
          follow.data()?.status !== "Complete" ||
          careDay(dateValue(follow.data()?.createdAt) || "") <
            careDay(report.createdAt)
        )
          throw new OwnerError(
            "Choose a later completed report in this season.",
          );
      }
      const step =
        input.kind === "planned" || input.stepIndex !== undefined
          ? report.plan?.steps[input.stepIndex ?? 0]
          : undefined;
      if (input.kind === "planned" && !step)
        throw new OwnerError(
          "No saved AI care suggestion is available for this report.",
        );
      if (input.kind === "applied" && !input.product.trim())
        throw new OwnerError("Enter the treatment or product actually used.");
      const entry = {
        reportId: input.reportId,
        kind: input.kind,
        treatmentId: input.treatmentId || "",
        product:
          input.kind === "planned" ? clean(step?.title, 160) : input.product,
        category: input.category,
        occurredOn: input.occurredOn,
        notes: input.notes,
        outcome: input.outcome,
        hasImage: Boolean(input.image),
        suggestion: step
          ? {
              title: step.title,
              materials: step.materials,
              source: "AI suggestion",
              verifiedProduct: false,
            }
          : null,
        followupReportId: input.followupReportId || "",
        createdAt: now,
        actorUid,
      };
      t.create(eventRef, entry);
      if (input.image)
        t.create(ref.collection("images").doc(eventRef.id), {
          image: input.image,
        });
      t.update(ref, { updatedAt: now });
    } else if (input.action === "event.void") {
      const event = await t.get(ref.collection("events").doc(input.eventId));
      if (!event.exists) throw new OwnerError("Care entry not found.", 404);
      assertVersion(event, input.version);
      t.update(event.ref, {
        voidedAt: now,
        voidReason: input.reason,
        voidedBy: actorUid,
      });
      t.delete(ref.collection("images").doc(event.id));
    }
    t.set(audit, {
      action: input.action,
      seasonId: season.id,
      actorUid,
      createdAt: now,
    });
    return { seasonId: season.id };
  });
  return result;
}
