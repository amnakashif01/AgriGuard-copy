import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
/** A durable cleanup marker is committed with report deletion. A retry can finish without recreating the report. */
export async function cleanDeletedReportCare(
  db: Firestore,
  uid: string,
  reportId: string,
) {
  const job = doc(db, "users", uid, "careDeletionJobs", reportId),
    record = await getDoc(job),
    seasonId = record.data()?.seasonId;
  if (
    !seasonId ||
    typeof seasonId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(seasonId)
  )
    return;
  const season = doc(db, "users", uid, "careSeasons", seasonId);
  for (const field of ["reportId", "followupReportId"])
    while (true) {
      const rows = await getDocs(
        query(
          collection(season, "events"),
          where(field, "==", reportId),
          limit(25),
        ),
      );
      if (rows.empty) break;
      const batch = writeBatch(db);
      rows.docs.forEach((d) => {
        if (field === "reportId") {
          batch.delete(d.ref);
          batch.delete(doc(season, "images", d.id));
        } else batch.update(d.ref, { followupReportId: "" });
      });
      await batch.commit();
    }
  await writeBatch(db).delete(job).commit();
}
