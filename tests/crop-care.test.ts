import { test } from "node:test";
import assert from "node:assert/strict";
import {
  careDay,
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

test("crop progress compares damage without mixing seasons or guessing missing levels", async () => {
  const { cropDamageChange } = await import("../src/lib/crop-care/report-photos");
  const current = { ...report, careSeasonId: "new-season", cropId: "wheat", plantId: "plant-a" };
  const previous = { ...current, id: "earlier", createdAt: "2026-02-01T10:00:00Z", severity: "Low" };
  assert.equal(cropDamageChange(previous, current)?.direction, "higher");
  assert.equal(cropDamageChange({ ...previous, severity: "High" }, current)?.direction, "lower");
  assert.equal(cropDamageChange({ ...previous, severity: "Medium" }, current)?.direction, "same");
  assert.equal(cropDamageChange({ ...previous, severity: "" }, current), null);
  assert.equal(cropDamageChange(previous, { ...current, severity: "Unknown" }), null);
  assert.equal(cropDamageChange({ ...previous, careSeasonId: "old-season" }, current), null);
  assert.equal(cropDamageChange({ ...previous, plantId: "plant-b" }, current), null);
});
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

test("Pakistan midnight is consistent across browser dates, server validation and report linking", () => {
  assert.equal(careDay("2026-10-13T21:00:00Z"), "2026-10-14");
  assert.equal(
    reportFitsSeason(
      { ...report, createdAt: "2026-10-13T21:00:00Z" },
      {
        crop: "Wheat",
        field: "Lahore field",
        label: "New cycle",
        startedOn: "2026-10-14",
        status: "active",
      },
    ),
    null,
  );
  assert.equal(careDay("invalid"), "");
});

test("photo comparison stays within the explicit season, plant and field", async () => {
  const { earlierCareReports } = await import(
    "../src/lib/crop-care/report-photos"
  );
  const current = {
    ...report,
    careSeasonId: "season-new",
    cropId: "wheat",
    plantId: "plant-a",
    fieldId: "field-a",
  };
  const previous = {
    ...current,
    id: "earlier",
    createdAt: "2026-02-01T10:00:00Z",
  };
  const candidates = [
    previous,
    ...[
      { careSeasonId: "season-old" },
      { cropId: "tomato" },
      { plantId: "plant-b" },
      { fieldId: "field-b" },
      { status: "Processing" },
      { createdAt: "bad-date" },
      { createdAt: current.createdAt },
      { createdAt: "2026-04-01T10:00:00Z" },
    ].map((patch, i) => ({ ...previous, id: `exclude-${i}`, ...patch })),
  ];
  assert.deepEqual(
    earlierCareReports(candidates, current).map((r) => r.id),
    ["earlier"],
  );
  assert.deepEqual(
    earlierCareReports(candidates, { ...current, careSeasonId: "" }),
    [],
  );
  const fieldCurrent = { ...current, plantId: "", fieldId: "" };
  assert.equal(
    earlierCareReports(
      [{ ...previous, plantId: "", fieldId: "" }],
      fieldCurrent,
    ).length,
    1,
  );
  assert.equal(earlierCareReports([previous], fieldCurrent).length, 0);
});

test("saved report photos remain complete above thumbnail size and reject unsafe data", async () => {
  const { savedCarePhoto } = await import("../src/lib/crop-care/report-photos");
  const full = "data:image/jpeg;base64," + "A".repeat(300000);
  assert.equal(
    savedCarePhoto(full),
    full,
    "must not truncate a saved analysis photo at 100k",
  );
  assert.equal(
    savedCarePhoto("", full),
    full,
    "legacy imageUrl can supply the saved raster",
  );
  for (const bad of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,<bad>",
    "data:image/png;base64," + "A".repeat(750001),
  ]) {
    assert.equal(savedCarePhoto(bad), "");
  }
});
