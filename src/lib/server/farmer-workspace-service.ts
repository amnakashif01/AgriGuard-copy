import type { DocumentSnapshot, Query } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { adminServices, OwnerError } from "./owner-auth";
import { farmerDetail, ownerRecords } from "./owner-service";
import type { OwnerAction } from "../owner-admin";
import type {
  FarmActivity,
  FarmPlant,
  FarmRecord,
  FarmReport,
  FarmResource,
  FarmWorkspace,
} from "../farmer-workspace";
type Services = ReturnType<typeof adminServices>;
const str = (v: unknown, max = 6000) =>
  typeof v === "string" ? v.slice(0, max) : "";
const strings = (v: unknown) =>
  Array.isArray(v) ? v.slice(0, 50).map((x) => str(x, 2000)) : [];
export const dateValue = (v: any): string | null => {
  const d = v?.toDate?.() || (v ? new Date(v) : null);
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
export const recordVersion = (s: DocumentSnapshot) =>
  `${s.updateTime?.toDate().getTime()}:${s.updateTime?.nanoseconds}`;
function requireVersion(s: DocumentSnapshot, expected: string) {
  if (!s.exists) throw new OwnerError("Record not found.", 404);
  if (recordVersion(s) !== expected)
    throw new OwnerError(
      "This record changed. Refresh before saving or deleting.",
      409,
    );
}
const validId = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 128 &&
  !/[\/\u0000-\u001f]/.test(v) &&
  v !== "." &&
  v !== "..";
const imageValue = (v: unknown) =>
  typeof v === "string" &&
  /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(v) &&
  v.length <= 750000
    ? v
    : "";
function historyFields(v: any) {
  const result: Record<string, string | number> = {};
  for (const k of [
    "disease",
    "description",
    "severity",
    "crop",
    "status",
    "progress",
    "careNotes",
  ])
    if (typeof v?.[k] === "string") result[k] = str(v[k]);
  return result;
}
export function reportProjection(
  doc: DocumentSnapshot,
  full = false,
): FarmReport {
  const d = doc.data() || {},
    p = d.plan,
    protection = d.protectionPlan;
  return {
    id: doc.id,
    version: recordVersion(doc),
    crop: str(d.crop, 80),
    cropId: str(d.cropId, 128),
    plantId: str(d.plantId, 128),
    plantName: str(d.plantName, 80),
    disease: str(d.disease, 150),
    severity: str(d.severity, 30),
    status: str(d.status, 30),
    createdAt: dateValue(d.createdAt),
    image: full ? imageValue(d.imageThumb) || imageValue(d.imageUrl) : "",
    description: full ? str(d.description) : "",
    symptoms: full ? str(d.symptoms, 2000) : "",
    age: str(d.age, 80),
    careNotes: full ? str(d.careNotes, 4000) : "",
    progress: str(d.progress, 40),
    severityScore: typeof d.severityScore === "number" ? d.severityScore : null,
    severityExplanation: full ? str(d.severityExplanation, 2000) : "",
    plan:
      full && p
        ? {
            timeline: str(p.timeline, 300),
            totalCost: Number(p.totalCost) || 0,
            steps: Array.isArray(p.steps)
              ? p.steps
                  .slice(0, 40)
                  .map((s: any) => ({
                    title: str(s.title, 200),
                    description: str(s.description),
                    timing: str(s.timing, 500),
                    materials: strings(s.materials),
                    cost: Number(s.cost) || 0,
                    safetyNotes: str(s.safetyNotes, 2000),
                  }))
              : [],
            preventionTips: strings(p.preventionTips),
          }
        : null,
    protectionPlan:
      full && protection
        ? {
            duration: str(protection.duration, 150),
            phases: Array.isArray(protection.phases)
              ? protection.phases
                  .slice(0, 24)
                  .map((p: any) => ({
                    week: Number(p.week) || 0,
                    title: str(p.title, 200),
                    tasks: strings(p.tasks),
                  }))
              : [],
            recommendations: strings(protection.recommendations),
          }
        : null,
    history:
      full && Array.isArray(d.history)
        ? d.history
            .slice(-100)
            .map((h: any) => ({
              action: str(h.action, 500),
              changedAt: dateValue(h.changedAt) || "",
              previousData: historyFields(h.previousData),
              newData: historyFields(h.newData),
            }))
        : [],
  };
}
export async function workspaceReport(s: Services, uid: string, id: string) {
  const doc = await s.db.doc(`users/${uid}/reports/${id}`).get();
  if (!doc.exists) throw new OwnerError("Report not found.", 404);
  const result = reportProjection(doc, true);
  if (
    !result.image &&
    typeof doc.data()?.imageUrl === "string" &&
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  ) {
    // Resolve only this account's own storage object, never an arbitrary URL or permanent download token.
    try {
      const url = new URL(doc.data()!.imageUrl);
      const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      const prefix = `/v0/b/${bucket}/o/`;
      if (
        url.protocol === "https:" &&
        url.hostname === "firebasestorage.googleapis.com" &&
        url.pathname.startsWith(prefix)
      ) {
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        if (path.startsWith(`reports/${uid}/`)) {
          const file = s.storage.bucket(bucket).file(path);
          const [metadata] = await file.getMetadata();
          if (
            Number(metadata.size) <= 2_000_000 &&
            /^image\/(png|jpeg|webp)$/.test(metadata.contentType || "")
          ) {
            const [bytes] = await file.download();
            result.image = `data:${metadata.contentType};base64,${bytes.toString("base64")}`;
          }
        }
      }
    } catch {
      /* Report remains readable if its saved image is unavailable. */
    }
  }
  return result;
}
async function pageQuery(
  query: Query,
  path: string,
  cursor?: string,
  size = 100,
) {
  if (cursor) {
    const snapshot = await query.firestore.doc(`${path}/${cursor}`).get();
    if (!snapshot.exists)
      throw new OwnerError("The list changed. Refresh it.", 409);
    query = query.startAfter(snapshot);
  }
  const page = await query.limit(size + 1).get();
  return { docs: page.docs.slice(0, size), hasMore: page.size > size };
}
export async function workspaceReports(
  s: Services,
  uid: string,
  cursor?: string,
) {
  const page = await pageQuery(
    s.db
      .collection(`users/${uid}/reports`)
      .orderBy("createdAt", "desc")
      .select(
        "crop",
        "cropId",
        "plantId",
        "plantName",
        "disease",
        "severity",
        "severityScore",
        "status",
        "age",
        "progress",
        "createdAt",
      ),
    `users/${uid}/reports`,
    cursor,
  );
  return {
    reports: page.docs.map((d) => reportProjection(d)),
    hasMore: page.hasMore,
  };
}
export async function workspacePlants(
  s: Services,
  uid: string,
  cropId: string,
  cursor?: string,
) {
  const crop = await s.db.doc(`users/${uid}/crops/${cropId}`).get();
  if (!crop.exists || crop.data()?.deletingAt)
    throw new OwnerError("Crop not available.", 404);
  const page = await pageQuery(
    crop.ref.collection("plants").orderBy("createdAt", "desc"),
    `${crop.ref.path}/plants`,
    cursor,
    20,
  );
  return {
    plants: page.docs.map((doc): FarmPlant => {
      const d = doc.data();
      return {
        id: doc.id,
        cropId,
        version: recordVersion(doc),
        name: str(d.name, 80),
        code: str(d.code, 30),
        age: str(d.age, 80),
        notes: str(d.notes, 2000),
        image: imageValue(d.imageThumb),
        recordCount: Number(d.recordCount) || 0,
        latestDisease: str(d.latestDisease, 150),
        createdAt: dateValue(d.createdAt),
        updatedAt: dateValue(d.updatedAt),
        deleting: Boolean(d.deletingAt),
      };
    }),
    hasMore: page.hasMore,
  };
}
export async function workspacePlantRecords(
  s: Services,
  uid: string,
  cropId: string,
  plantId: string,
  cursor?: string,
) {
  const ref = s.db.doc(`users/${uid}/crops/${cropId}/plants/${plantId}`);
  const parent = await ref.get();
  if (!parent.exists || parent.data()?.deletingAt)
    throw new OwnerError("Plant not available.", 404);
  const page = await pageQuery(
    ref.collection("records").orderBy("createdAt", "desc"),
    `${ref.path}/records`,
    cursor,
    12,
  );
  const docs = page.docs.length
    ? await s.db.getAll(
        ...page.docs.map((d) => s.db.doc(`users/${uid}/reports/${d.id}`)),
      )
    : [];
  return {
    reports: docs
      .filter(
        (d) =>
          d.exists &&
          d.data()?.cropId === cropId &&
          d.data()?.plantId === plantId,
      )
      .map((d) => ({
        ...reportProjection(d, true),
        image: imageValue(
          page.docs.find((r) => r.id === d.id)?.data().imageThumb,
        ),
      })),
    hasMore: page.hasMore,
    cursor: page.docs.at(-1)?.id || "",
  };
}
export async function requireSharing(s: Services, uid: string) {
  const [profile, control] = await Promise.all([
    s.db.doc(`community_profiles/${uid}`).get(),
    s.db.doc(`account_controls/${uid}`).get(),
  ]);
  if (
    !profile.exists ||
    profile.data()?.sharingVersion !== 2 ||
    profile.data()?.enabled !== true ||
    control.data()?.disabled
  )
    throw new OwnerError(
      "This farmer is not sharing their account information.",
      404,
    );
  return {
    uid,
    name: str(profile.data()?.name, 80),
    city: str(profile.data()?.city, 80),
  };
}
export async function workspace(
  s: Services,
  uid: string,
  owner: boolean,
): Promise<FarmWorkspace> {
  const shared = owner ? null : await requireSharing(s, uid);
  const [detail, cropPage, reportPage, consent] = await Promise.all([
    owner ? farmerDetail(s, uid) : null,
    ownerRecords(s, uid, "crops"),
    workspaceReports(s, uid),
    s.db.doc(`community_profiles/${uid}`).get(),
  ]);
  const [cropCount, reportCount, cropStats] = await Promise.all([
    s.db.collection(`users/${uid}/crops`).count().get(),
    s.db.collection(`users/${uid}/reports`).count().get(),
    s.db.collection(`users/${uid}/crops`).select("plantCount").get(),
  ]);
  const activity: FarmActivity[] = [
    ...cropPage.crops.map((c) => ({
      id: `crop-${c.id}`,
      title: `Added ${c.name}`,
      date: c.createdAt,
      detail: "Crop record",
    })),
    ...reportPage.reports.map((r) => ({
      id: `report-${r.id}`,
      title: `${r.plantName || r.crop || "Plant"} report`,
      date: r.createdAt,
      detail: `${r.disease} · ${r.status}`,
    })),
  ]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 30);
  const result: FarmWorkspace = {
    uid,
    name: detail?.farmer.name || shared!.name,
    city: detail?.farmer.location || shared?.city || "",
    crops: cropPage.crops,
    reports: reportPage.reports,
    cropCount: cropCount.data().count,
    plantCount: cropStats.docs.reduce(
      (n, d) => n + (Number(d.data().plantCount) || 0),
      0,
    ),
    reportCount: reportCount.data().count,
    hasMoreCrops: cropPage.hasMore,
    hasMoreReports: reportPage.hasMore,
    activity,
    ownerActivity: detail?.activity || [],
    sharing:
      consent.data()?.sharingVersion === 2 && consent.data()?.enabled === true,
  };
  if (detail) {
    const profile = (await s.db.doc(`profiles/${uid}`).get()).data() || {};
    result.farmer = detail.farmer;
    result.profileVersion = detail.profileVersion;
    result.preferences = {
      language: profile.language || "english",
      crops: strings(profile.crops),
      weatherAlerts: profile.notificationPreferences?.weatherAlerts ?? true,
      priceUpdates: profile.notificationPreferences?.priceUpdates ?? false,
      treatmentReminders:
        profile.notificationPreferences?.treatmentReminders ?? true,
    };
  }
  return result;
}
export const resourceFields: Record<FarmResource, string[]> = {
  fields: [
    "name",
    "cropType",
    "variety",
    "plantingDate",
    "location",
    "growthStage",
    "notes",
  ],
  marketplace: [
    "title",
    "description",
    "price",
    "location",
    "contact",
    "tags",
    "status",
  ],
  contacts: ["supplierId", "message", "contactMethod", "status"],
  ratings: ["supplierId", "rating", "review"],
  notifications: ["title", "message", "type", "read"],
  logs: ["agentName", "action", "status", "reportId", "duration"],
};
function resourceCollection(s: Services, uid: string, resource: FarmResource) {
  if (resource === "marketplace")
    return { collection: s.db.collection("marketplace"), key: "sellerId" };
  if (resource === "contacts" || resource === "ratings")
    return {
      collection: s.db.collection(
        resource === "contacts" ? "supplier_contacts" : "supplier_ratings",
      ),
      key: "userId",
    };
  return { collection: s.db.collection(`users/${uid}/${resource}`), key: "" };
}
export async function workspaceRecords(
  s: Services,
  uid: string,
  resource: FarmResource,
  cursor?: string,
) {
  const { collection, key } = resourceCollection(s, uid, resource);
  let query: Query = key ? collection.where(key, "==", uid) : collection;
  query = query.orderBy("__name__");
  if (cursor) query = query.startAfter(cursor);
  const page = await query.limit(101).get();
  return {
    records: page.docs.slice(0, 100).map((doc): FarmRecord => {
      const d = doc.data(),
        values: FarmRecord["values"] = {};
      for (const f of resourceFields[resource])
        if (["string", "number", "boolean"].includes(typeof d[f]))
          values[f] = d[f];
        else if (Array.isArray(d[f])) values[f] = strings(d[f]);
      return {
        id: doc.id,
        version: recordVersion(doc),
        title: str(
          d.name || d.title || d.action || d.supplierId || resource,
          180,
        ),
        values,
        createdAt: dateValue(d.createdAt || d.timestamp),
      };
    }),
    hasMore: page.size > 100,
  };
}
export async function workspaceMutation(s: Services, action: OwnerAction) {
  const { db } = s;
  const now = new Date().toISOString();
  const root = `users/${action.uid}`;
  if (action.action === "community.hide") {
    await db
      .doc(`community_profiles/${action.uid}`)
      .set({ enabled: false, updatedAt: now }, { merge: true });
    return;
  }
  if (action.action === "preferences.update") {
    const ref = db.doc(`profiles/${action.uid}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      requireVersion(doc, action.version);
      tx.update(ref, {
        language: action.language,
        crops: action.crops,
        notificationPreferences: {
          weatherAlerts: action.weatherAlerts,
          priceUpdates: action.priceUpdates,
          treatmentReminders: action.treatmentReminders,
        },
        updatedAt: now,
      });
    });
    return;
  }
  if (action.action === "record.update" || action.action === "record.delete") {
    const { collection, key } = resourceCollection(
      s,
      action.uid,
      action.resource,
    );
    const ref = collection.doc(action.recordId);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      requireVersion(doc, action.version);
      if (key && doc.data()?.[key] !== action.uid)
        throw new OwnerError("Record does not belong to this farmer.", 403);
      if (action.action === "record.delete") {
        tx.delete(ref);
        return;
      }
      const entries = Object.entries(action.values);
      if (
        !entries.length ||
        entries.some(
          ([k, v]) =>
            !resourceFields[action.resource].includes(k) ||
            ["supplierId", "type"].includes(k) ||
            (["price", "rating"].includes(k)
              ? typeof v !== "number" ||
                v < 0 ||
                (k === "rating" && (v < 1 || v > 5))
              : k === "read"
                ? typeof v !== "boolean"
                : typeof v !== "string"),
        )
      )
        throw new OwnerError("Check the editable fields.");
      const values: Record<string, unknown> = { ...action.values };
      if (typeof values.tags === "string")
        values.tags = values.tags
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 20);
      tx.update(ref, { ...values, updatedAt: now });
    });
    return;
  }
  if (action.action === "plant.update" || action.action === "plant.delete") {
    const cropRef = db.doc(`${root}/crops/${action.cropId}`),
      ref = cropRef.collection("plants").doc(action.plantId);
    if (action.action === "plant.update") {
      await db.runTransaction(async (tx) => {
        const [crop, plant, siblings] = await Promise.all([
          tx.get(cropRef),
          tx.get(ref),
          tx.get(cropRef.collection("plants")),
        ]);
        requireVersion(plant, action.version);
        if (!crop.exists || crop.data()?.deletingAt || plant.data()?.deletingAt)
          throw new OwnerError("This crop or plant is being deleted.", 409);
        const nameKey = action.name
          .normalize("NFKC")
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (
          siblings.docs.some(
            (d) =>
              d.id !== ref.id &&
              str(d.data().name)
                .normalize("NFKC")
                .toLowerCase()
                .replace(/\s+/g, " ") === nameKey,
          )
        )
          throw new OwnerError("A plant with this name already exists.", 409);
        tx.update(ref, {
          name: action.name,
          nameKey,
          age: action.age,
          notes: action.notes,
          updatedAt: now,
        });
        tx.update(cropRef, { updatedAt: now });
      });
      return;
    }
    await db.runTransaction(async (tx) => {
      const [crop, plant] = await Promise.all([tx.get(cropRef), tx.get(ref)]);
      requireVersion(plant, action.version);
      if (!crop.exists || crop.data()?.deletingAt)
        throw new OwnerError("This crop is unavailable.", 409);
      if (action.confirmation !== plant.data()?.name)
        throw new OwnerError("Enter the plant name to confirm.");
      tx.update(ref, { deletingAt: now });
      tx.update(cropRef, { updatedAt: now });
    });
    const linked = await db
      .collection(`${root}/reports`)
      .where("plantId", "==", action.plantId)
      .get();
    for (const report of linked.docs.filter(
      (d) => d.data().cropId === action.cropId,
    )) {
      const b = db.batch();
      if (report.data().careSeasonId) b.set(db.doc(`${root}/careDeletionJobs/${report.id}`), {seasonId: report.data().careSeasonId});
      b.delete(report.ref);
      b.delete(db.doc(`${root}/notifications/diagnosis_${report.id}`));
      b.delete(db.doc(`community_profiles/${action.uid}/cases/${report.id}`));
      await b.commit();
      const { cleanDeletedReportCareAdmin } = await import("./crop-care-cleanup");
      await cleanDeletedReportCareAdmin(db, action.uid, report.id);
    }
    // Keep the parent lock until children are removed; a retry cannot decrement twice.
    for (const children of await ref.listCollections())
      await db.recursiveDelete(children);
    await db.runTransaction(async (tx) => {
      const [crop, plant] = await Promise.all([tx.get(cropRef), tx.get(ref)]);
      if (!plant.exists) return;
      tx.delete(ref);
      if (crop.exists)
        tx.update(cropRef, {
          plantCount: Math.max(0, (Number(crop.data()?.plantCount) || 0) - 1),
          updatedAt: now,
        });
    });
    return;
  }
  if (
    action.action === "report.update" ||
    action.action === "plan.update" ||
    action.action === "report.delete"
  ) {
    const ref = db.doc(`${root}/reports/${action.reportId}`);
    await db.runTransaction(async (tx) => {
      const report = await tx.get(ref);
      // Resume a previously committed report deletion if care cleanup was interrupted.
      if (!report.exists && action.action === "report.delete") return;
      requireVersion(report, action.version);
      const d = report.data()!;
      const linked = validId(d.cropId) && validId(d.plantId);
      const cropRef = linked ? db.doc(`${root}/crops/${d.cropId}`) : null,
        plantRef = linked
          ? db.doc(`${root}/crops/${d.cropId}/plants/${d.plantId}`)
          : null;
      const recordRef = plantRef
        ?.collection("records")
        .doc(validId(d.plantRecordId) ? d.plantRecordId : action.reportId);
      const [crop, plant, record, records] = await Promise.all([
        cropRef ? tx.get(cropRef) : null,
        plantRef ? tx.get(plantRef) : null,
        recordRef ? tx.get(recordRef) : null,
        plantRef
          ? tx.get(plantRef.collection("records").orderBy("createdAt", "desc"))
          : null,
      ]);
      if (crop?.data()?.deletingAt || plant?.data()?.deletingAt)
        throw new OwnerError("This crop or plant is being deleted.", 409);
      if (action.action === "plan.update") {
        const plan = {
          ...action.plan,
          steps: action.plan.steps.map((step, index) => ({
            ...step,
            stepNumber: index + 1,
          })),
        };
        tx.update(ref, {
          plan,
          updatedAt: now,
          history: FieldValue.arrayUnion({
            action: "Owner updated the saved care plan",
            changedAt: now,
          }),
        });
        if (record?.exists && recordRef)
          tx.update(recordRef, { "diagnosis.plan": plan });
      } else if (action.action === "report.update") {
        const changes = {
          disease: action.disease,
          description: action.description,
          symptoms: action.symptoms,
          severity: action.severity,
          careNotes: action.careNotes,
          progress: action.progress,
        };
        tx.update(ref, {
          ...changes,
          updatedAt: now,
          history: FieldValue.arrayUnion({
            action: "Owner updated report details and care progress",
            changedAt: now,
            previousData: historyFields(d),
            newData: historyFields(changes),
          }),
        });
        if (record?.exists && recordRef)
          tx.update(recordRef, {
            "diagnosis.disease": action.disease,
            "diagnosis.description": action.description,
            "diagnosis.severity": action.severity,
            symptoms: action.symptoms,
            careNotes: action.careNotes,
            progress: action.progress,
          });
        if (
          plant?.exists &&
          plantRef &&
          plant.data()?.latestRecordId === action.reportId
        )
          tx.update(plantRef, {
            latestDisease: action.disease,
            updatedAt: now,
          });
      } else {
        if (action.confirmation !== (d.disease || action.reportId))
          throw new OwnerError(
            "Enter the report diagnosis to confirm deletion.",
          );
        if (d.careSeasonId) tx.set(db.doc(`${root}/careDeletionJobs/${action.reportId}`), {seasonId: d.careSeasonId});
        tx.delete(ref);
        if (recordRef) tx.delete(recordRef);
        tx.delete(db.doc(`${root}/notifications/diagnosis_${action.reportId}`));
        tx.delete(
          db.doc(`community_profiles/${action.uid}/cases/${action.reportId}`),
        );
        if (plant?.exists && plantRef) {
          const remaining =
              records?.docs.filter((r) => r.id !== recordRef?.id) || [],
            latest = remaining[0];
          tx.update(plantRef, {
            recordCount: remaining.length,
            latestRecordId: latest?.id || "",
            imageThumb: latest?.data().imageThumb || "",
            latestDisease: latest?.data().diagnosis?.disease || "",
            latestSeverityScore: latest?.data().severityScore ?? null,
            updatedAt: now,
          });
        }
      }
      if (crop?.exists && cropRef) tx.update(cropRef, { updatedAt: now });
    });
    if (action.action === "report.delete") { const { cleanDeletedReportCareAdmin } = await import("./crop-care-cleanup"); await cleanDeletedReportCareAdmin(db, action.uid, action.reportId); }
    return;
  }
  throw new OwnerError("Unsupported workspace action.");
}
