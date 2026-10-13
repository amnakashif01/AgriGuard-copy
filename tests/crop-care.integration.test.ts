import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "season care lifecycle, recurrence, privacy and deletion against Firebase emulators",
  {
    skip:
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    timeout: 120000,
  },
  async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-agriguard-owner";
    const { adminServices } = await import("../src/lib/server/owner-auth");
    const { GET, POST } = await import("../src/app/api/crop-care/route");
    const { cleanDeletedReportCareAdmin, deleteCropCareAdmin } = await import(
      "../src/lib/server/crop-care-cleanup"
    );
    const { OWNER_EMAIL } = await import("../src/lib/owner-admin");
    const s = adminServices(),
      { db, auth } = s;
    const password = "EmulatorOnly!2026";
    async function user(uid: string, email: string, owner = false) {
      await auth.createUser({ uid, email, password });
      if (owner)
        await auth.setCustomUserClaims(uid, { owner: true, admin: true });
      const r = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      );
      const body = await r.json();
      assert.ok(body.idToken, JSON.stringify(body.error));
      return body.idToken as string;
    }
    const farmer = await user("care-farmer", "care@example.test"),
      other = await user("care-other", "other-care@example.test"),
      owner = await user("care-owner", OWNER_EMAIL, true);
    const request = (
      token: string | undefined,
      params: Record<string, string> = {},
      body?: unknown,
    ) =>
      new Request(
        "https://agri-guard-copy.vercel.app/api/crop-care?" +
          new URLSearchParams(params),
        {
          method: body ? "POST" : "GET",
          headers: {
            ...(token ? { Authorization: "Bearer " + token } : {}),
            "Content-Type": "application/json",
            Origin: "https://agri-guard-copy.vercel.app",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
    async function read(
      params: Record<string, string>,
      status = 200,
      token = farmer,
    ) {
      const r = await GET(request(token, params)),
        b = await r.json();
      assert.equal(r.status, status, JSON.stringify(b));
      return b;
    }
    async function write(
      body: unknown,
      status = 200,
      token = farmer,
      params: Record<string, string> = {},
    ) {
      const r = await POST(request(token, params, body)),
        b = await r.json();
      assert.equal(r.status, status, JSON.stringify(b));
      return b;
    }
    assert.equal((await GET(request(undefined))).status, 401);
    await read({ uid: "care-farmer" }, 403, other);
    await read({ uid: "care-farmer", scope: "community" }, 404, other);
    const base = {
      crop: "Wheat",
      disease: "Aphids",
      status: "Complete",
      severity: "Medium",
      confidence: 90,
      expertReviewRequired: false,
      analysisImage: "PRIVATE_LARGE_IMAGE",
      privateNotes: "PRIVATE",
      plan: {
        steps: [
          {
            title: "Monitor affected leaves",
            description: "Inspect the crop",
            materials: [],
            timing: "Regularly",
            safetyNotes: "",
          },
        ],
        preventionTips: [],
      },
    };
    for (const [id, createdAt, disease] of [
      ["old", "2025-03-01T10:00:00Z", "Aphids"],
      ["new", "2026-03-01T10:00:00Z", "Aphids"],
      ["follow", "2026-03-10T10:00:00Z", "Aphids"],
      ["legacy", "2024-03-01T10:00:00Z", "Aphids"],
      ["different", "2023-03-01T10:00:00Z", "Rust"],
    ])
      await db
        .doc("users/care-farmer/reports/" + id)
        .set({ ...base, createdAt, disease });
    const oldSeason = {
      crop: "Wheat",
      field: "Private plot address",
      label: "Wheat 2024–25",
      startedOn: "2024-11-01",
      endedOn: "2025-04-30",
      status: "completed",
    };
    const newSeason = {
      crop: "Wheat",
      field: "Private plot address",
      label: "Wheat 2025–26",
      startedOn: "2025-11-01",
      status: "active",
    };
    await write({
      action: "season.create",
      requestId: "season-old",
      season: oldSeason,
      reportId: "old",
    });
    await write({
      action: "season.create",
      requestId: "season-old",
      season: oldSeason,
      reportId: "old",
    });
    await write(
      { action: "report.link", seasonId: "season-old", reportId: "new" },
      409,
    );
    await write({
      action: "season.create",
      requestId: "season-new",
      season: newSeason,
      reportId: "new",
    });
    await write({
      action: "report.link",
      seasonId: "season-new",
      reportId: "follow",
    });
    let context = await read({ resource: "context", reportId: "new" });
    assert.equal(context.seasons.items.length, 2);
    assert.equal(context.season.id, "season-new");
    assert.equal(context.report.analysisImage, undefined);
    const event = (requestId: string, kind: string, extra: object = {}) => ({
      action: "event.add",
      requestId,
      kind,
      seasonId: "season-new",
      reportId: "new",
      occurredOn: "2026-03-04",
      ...extra,
    });
    await write(event("plan", "planned"));
    let events = await read({ resource: "events", seasonId: "season-new" });
    assert.equal(events.items[0].kind, "planned");
    assert.equal(events.items[0].outcome, "Not yet checked");
    await write(
      event("bad-follow", "followup", {
        treatmentId: "plan",
        outcome: "Improved",
      }),
      400,
    );
    await write(
      event("actual", "applied", {
        product: "Farmer-selected treatment",
        image: "data:image/png;base64,YQ==",
      }),
    );
    await write(
      event("actual", "applied", {
        product: "Farmer-selected treatment",
        image: "data:image/png;base64,YQ==",
      }),
    );
    await write(
      event("too-early", "followup", {
        occurredOn: "2026-03-03",
        treatmentId: "actual",
        outcome: "Improved",
      }),
      400,
    );
    await write(
      event("check1", "followup", {
        occurredOn: "2026-03-06",
        treatmentId: "actual",
        outcome: "No change",
      }),
    );
    await write(
      event("check2", "followup", {
        occurredOn: "2026-03-10",
        treatmentId: "actual",
        outcome: "Improved",
        followupReportId: "follow",
      }),
    );
    await write(
      { action: "report.unlink", reportId: "new", seasonId: "season-new" },
      409,
    );
    events = await read({ resource: "events", seasonId: "season-new" });
    assert.equal(events.items.length, 4);
    assert.equal(
      events.items.filter((e: any) => e.kind === "followup").length,
      2,
    );
    assert.equal(
      events.items.find((e: any) => e.id === "actual").suggestion,
      null,
    );
    assert.equal(
      events.items.find((e: any) => e.id === "actual").image,
      undefined,
    );
    assert.equal(
      (
        await read({
          resource: "event-image",
          seasonId: "season-new",
          eventId: "actual",
        })
      ).image,
      "data:image/png;base64,YQ==",
    );
    await write({
      action: "event.add",
      requestId: "past-treatment",
      seasonId: "season-old",
      reportId: "old",
      kind: "applied",
      product: "Recorded prior-season treatment",
      occurredOn: "2025-03-02",
    });
    await write({
      action: "event.add",
      requestId: "past-check",
      seasonId: "season-old",
      reportId: "old",
      kind: "followup",
      treatmentId: "past-treatment",
      outcome: "Improved",
      occurredOn: "2025-03-05",
    });
    const history = await read({ resource: "history", reportId: "new" });
    assert.deepEqual(history.matches.map((m: any) => m.report.id).sort(), [
      "legacy",
      "old",
    ]);
    assert.equal(
      history.matches.find((m: any) => m.report.id === "legacy").season,
      null,
    );
    assert.equal(
      history.matches.find((m: any) => m.report.id === "old").treatments.length,
      2,
    );
    assert.equal(history.unassignedCount, 2);
    const fullSeason = await read({
      resource: "season",
      seasonId: "season-new",
    });
    const {
      id,
      version,
      cropKey,
      createdAt,
      updatedAt,
      reportCount,
      ...editable
    } = fullSeason;
    await write(
      {
        action: "season.update",
        seasonId: id,
        version,
        season: { ...editable, endedOn: "2026-03-05", status: "completed" },
      },
      409,
    );
    await write({
      action: "season.update",
      seasonId: id,
      version,
      season: { ...editable, label: "Updated season" },
    });
    await write(
      {
        action: "season.update",
        seasonId: id,
        version,
        season: { ...editable, label: "Stale season" },
      },
      409,
    );
    await db
      .doc("community_profiles/care-farmer")
      .set({ sharingVersion: 2, enabled: true, name: "Shared farmer" });
    const shared = await read(
      {
        uid: "care-farmer",
        scope: "community",
        resource: "season-detail",
        seasonId: "season-new",
      },
      200,
      other,
    );
    assert.equal(shared.season.field, "Shared growing area");
    assert.ok(!JSON.stringify(shared).includes("PRIVATE_LARGE_IMAGE"));
    assert.ok(!JSON.stringify(shared).includes("Private plot address"));
    await write(
      event("forbidden", "applied", { product: "unauthorized" }),
      403,
      other,
      { uid: "care-farmer", scope: "community" },
    );
    await write(
      event("owner-care", "applied", { product: "Owner-entered care" }),
      200,
      owner,
      { uid: "care-farmer" },
    );
    await db.doc("community_profiles/care-farmer").update({ enabled: false });
    await read({ uid: "care-farmer", scope: "community" }, 404, other);
    const actual = events.items.find((e: any) => e.id === "actual");
    await write({
      action: "event.void",
      seasonId: "season-new",
      eventId: "actual",
      version: actual.version,
      reason: "Correction test",
    });
    await read(
      { resource: "event-image", seasonId: "season-new", eventId: "actual" },
      404,
    );
    await db.doc("account_controls/care-farmer").set({ disabled: true });
    await write(event("blocked", "applied", { product: "Blocked" }), 401);
    await write(
      event("blocked-owner", "applied", { product: "Blocked" }),
      403,
      owner,
      { uid: "care-farmer" },
    );
    await db.doc("account_controls/care-farmer").delete();
    const job = db.doc("users/care-farmer/careDeletionJobs/new");
    await job.set({ seasonId: "season-new" });
    await db.doc("users/care-farmer/reports/new").delete();
    await cleanDeletedReportCareAdmin(db, "care-farmer", "new");
    assert.equal(
      (
        await db
          .collection("users/care-farmer/careSeasons/season-new/events")
          .where("reportId", "==", "new")
          .get()
      ).size,
      0,
    );
    assert.equal((await job.get()).exists, false);
    await deleteCropCareAdmin(db, "care-farmer", fullSeason.cropId);
    assert.equal(
      (await db.collection("users/care-farmer/careSeasons").get()).size,
      0,
    );
    // Isolated emulator fixtures only.
    await db.recursiveDelete(db.doc("users/care-farmer"));
    await db.doc("community_profiles/care-farmer").delete();
    await Promise.all(
      ["care-farmer", "care-other", "care-owner"].map((uid) =>
        auth.deleteUser(uid),
      ),
    );
  },
);
