import type { Firestore } from "firebase-admin/firestore";
export async function cleanDeletedReportCareAdmin(
  db: Firestore,
  uid: string,
  reportId: string,
) {
  const job = db.doc(`users/${uid}/careDeletionJobs/${reportId}`),
    record = await job.get(),
    seasonId = record.data()?.seasonId;
  if (typeof seasonId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(seasonId))
    return;
  const season = db.doc(`users/${uid}/careSeasons/${seasonId}`);
  for (const field of ["reportId", "followupReportId"])
    while (true) {
      const rows = await season
        .collection("events")
        .where(field, "==", reportId)
        .limit(25)
        .get();
      if (rows.empty) break;
      const batch = db.batch();
      rows.docs.forEach((d) => {
        if (field === "reportId") {
          batch.delete(d.ref);
          batch.delete(season.collection("images").doc(d.id));
        } else batch.update(d.ref, { followupReportId: "" });
      });
      await batch.commit();
    }
  await job.delete();
}
export async function deleteCropCareAdmin(
  db: Firestore,
  uid: string,
  cropId: string,
) {
  const seasons = await db
    .collection(`users/${uid}/careSeasons`)
    .where("cropId", "==", cropId)
    .get();
  for (const season of seasons.docs) {
    const writer = db.bulkWriter();
    try {
      await db.recursiveDelete(season.ref, writer);
    } finally {
      await writer.close();
    }
  }
}
