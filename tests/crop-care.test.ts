import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cropKey,
  cropNames,
  day,
  diseaseMatch,
  reportFitsSeason,
  latestOutcome,
  careAction,
  type CareReport,
  type CareEvent,
} from "../src/lib/crop-care/models";
const report: CareReport = {
  id: "current",
  crop: "Wheat",
  disease: "Aphids",
  severity: "Medium",
  confidence: 90,
  expertReviewRequired: false,
  status: "Complete",
  createdAt: "2026-03-01T10:00:00Z",
  careSeasonId: "",
  cropId: "",
  plantId: "",
  fieldId: "",
};
test("crop aliases preserve identity without merging different crops", () => {
  assert.equal(cropKey("  Corn  "), "maize");
  assert.equal(cropKey("گندم"), "wheat");
  assert.ok(cropNames("Maize").includes("Corn"));
  assert.notEqual(cropKey("Wheat"), cropKey("Rice"));
});
test("season dates distinguish new plantings and reject another crop or plant", () => {
  const season = {
    crop: "Wheat",
    field: "North field",
    label: "2025",
    startedOn: "2024-11-01",
    endedOn: "2025-04-30",
    status: "completed" as const,
  };
  assert.match(reportFitsSeason(report, season)!, /outside/);
  assert.equal(
    reportFitsSeason({ ...report, createdAt: "2025-03-01T10:00:00Z" }, season),
    null,
  );
  assert.match(
    reportFitsSeason({ ...report, crop: "Tomato" }, season)!,
    /same crop/,
  );
  assert.match(
    reportFitsSeason(
      { ...report, plantId: "p2" },
      { ...season, endedOn: "2026-04-30", plantId: "p1" },
    )!,
    /different plant/,
  );
  assert.equal(day.safeParse("2025-02-29").success, false);
  assert.equal(day.safeParse("2024-02-29").success, true);
});
test("recurrence requires a matching diagnosis; uncertainty and healthy records are not claimed as confirmed disease", () => {
  assert.equal(
    diseaseMatch(report, { ...report, disease: "Aphid infestation" })?.match,
    "same",
  );
  assert.equal(
    diseaseMatch(report, { ...report, disease: "Possible aphids" })?.match,
    "similar",
  );
  assert.equal(
    diseaseMatch(
      { ...report, disease: "Early blight" },
      { ...report, disease: "Late blight" },
    ),
    null,
  );
  assert.equal(
    diseaseMatch(
      { ...report, disease: "Healthy" },
      { ...report, disease: "Healthy" },
    ),
    null,
  );
  assert.equal(diseaseMatch(report, { ...report, crop: "Mango" }), null);
  assert.equal(
    diseaseMatch(report, { ...report, confidence: null })?.match,
    "similar",
  );
});
test("follow-up history is chronological and ignores voided observations", () => {
  const item = {
    kind: "followup",
    treatmentId: "t",
    voidedAt: "",
    createdAt: "2026-03-05",
  };
  const entries = [
    { ...item, id: "a", occurredOn: "2026-03-04", outcome: "Improved" },
    { ...item, id: "b", occurredOn: "2026-03-06", outcome: "Worsened" },
    {
      ...item,
      id: "c",
      occurredOn: "2026-03-08",
      outcome: "No change",
      voidedAt: "2026-03-09",
    },
  ] as CareEvent[];
  assert.equal(latestOutcome(entries, "t")?.id, "b");
  assert.equal(entries.length, 3);
  assert.equal(
    careAction.safeParse({
      action: "event.add",
      requestId: "x",
      seasonId: "s",
      reportId: "r",
      kind: "applied",
      occurredOn: "2026-02-30",
    }).success,
    false,
  );
});
