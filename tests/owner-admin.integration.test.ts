import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "owner permissions, account lifecycle and crop deletion against Firebase emulators",
  {
    skip:
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    timeout: 120000,
  },
  async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-agriguard-owner";
    const { adminServices } = await import("../src/lib/server/owner-auth");
    const { GET, POST } = await import("../src/app/api/owner/route");
    const community = await import("../src/app/api/community/route");
    const { ownerOverview, farmerDetail } = await import(
      "../src/lib/server/owner-service"
    );
    const { OWNER_EMAIL } = await import("../src/lib/owner-admin");
    const services = adminServices();
    const { auth, db } = services;
    await db.doc("account_controls/emulator-check").get();
    const testPassword = "EmulatorOnly!2026";
    const owner = await auth.createUser({
      uid: "owner-test",
      email: OWNER_EMAIL,
      password: testPassword,
    });
    await auth.setCustomUserClaims(owner.uid, { owner: true, admin: true });
    const farmer = await auth.createUser({
      uid: "farmer-test",
      email: "farmer@example.test",
      password: testPassword,
    });
    const other = await auth.createUser({
      uid: "other-farmer",
      email: "other@example.test",
      password: testPassword,
    });
    const signIn = async (email: string) => {
      const response = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: testPassword,
            returnSecureToken: true,
          }),
        },
      );
      const result = await response.json();
      assert.ok(result.idToken, JSON.stringify(result.error));
      return result.idToken as string;
    };
    const ownerToken = await signIn(OWNER_EMAIL);
    const farmerToken = await signIn(farmer.email!);
    const request = (token?: string, action?: unknown, query = "") =>
      new Request(`https://agri-guard-copy.vercel.app/api/owner${query}`, {
        method: action ? "POST" : "GET",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(action
            ? {
                "Content-Type": "application/json",
                Origin: "https://agri-guard-copy.vercel.app",
              }
            : {}),
        },
        ...(action ? { body: JSON.stringify(action) } : {}),
      });
    const write = async (action: unknown, status = 200, token = ownerToken) => {
      const response = await POST(request(token, action));
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      return body;
    };
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request(farmerToken))).status, 403);
    assert.equal((await GET(request("fake-token"))).status, 401);
    const now = new Date().toISOString();
    await db.doc(`profiles/${farmer.uid}`).set({
      uid: farmer.uid,
      phone: "",
      name: "Original Farmer",
      location: "Lahore",
      createdAt: now,
    });
    await db
      .doc(`profiles/${other.uid}`)
      .set({ uid: other.uid, phone: "", name: "Other Farmer", createdAt: now });
    await db.doc(`users/${farmer.uid}/crops/crop-one`).set({
      name: "Wheat",
      nameKey: "wheat",
      plantCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`users/${farmer.uid}/crops/crop-one/plants/plant-one`).set({
      name: "Plant A",
      cropId: "crop-one",
      age: "2 months",
      recordCount: 1,
      latestRecordId: "report-one",
      createdAt: now,
    });
    await db
      .doc(
        `users/${farmer.uid}/crops/crop-one/plants/plant-one/records/report-one`,
      )
      .set({ reportId: "report-one", createdAt: now });
    await db.doc(`users/${farmer.uid}/reports/report-one`).set({
      uid: farmer.uid,
      cropId: "crop-one",
      plantId: "plant-one",
      plantRecordId: "report-one",
      crop: "Wheat",
      disease: "Saved diagnosis",
      createdAt: now,
    });
    await db
      .doc(`users/${farmer.uid}/notifications/diagnosis_report-one`)
      .set({ createdAt: now });
    await db
      .doc(`users/${other.uid}/crops/keep`)
      .set({ name: "Tomato", createdAt: now });
    await db.doc(`account_presence/${farmer.uid}`).set({ lastSeenAt: now });
    const overview = await ownerOverview(services, "", 1, "all");
    assert.equal(overview.stats.farmers, 3);
    assert.equal(overview.stats.crops, 2);
    assert.equal(overview.stats.reports, 1);
    assert.equal(overview.stats.online, 1);
    assert.equal((await ownerOverview(services, "Lahore", 1, "all")).total, 1);
    let detail = await farmerDetail(services, farmer.uid);
    await write({
      action: "profile.update",
      uid: farmer.uid,
      version: detail.profileVersion,
      name: "Updated Farmer",
      location: "Islamabad",
    });
    assert.equal(
      (await auth.getUser(farmer.uid)).displayName,
      "Updated Farmer",
    );
    await write(
      {
        action: "profile.update",
        uid: farmer.uid,
        version: detail.profileVersion,
        name: "Stale edit",
        location: "Lahore",
      },
      409,
    );
    await write(
      {
        action: "profile.update",
        uid: other.uid,
        version: "missing",
        name: "Attack",
        location: "",
      },
      403,
      farmerToken,
    );
    await write(
      { action: "account.delete", uid: owner.uid, confirmation: OWNER_EMAIL },
      403,
    );
    await write({ action: "account.suspend", uid: owner.uid }, 403);
    await write({
      action: "crop.update",
      uid: farmer.uid,
      cropId: "crop-one",
      version: detail.crops[0].version,
      name: "Spring Wheat",
      notes: "Owner correction",
    });
    detail = await farmerDetail(services, farmer.uid);
    assert.equal(detail.crops[0].name, "Spring Wheat");
    assert.equal(
      (await db.doc(`users/${farmer.uid}/reports/report-one`).get()).data()
        ?.crop,
      "Wheat",
    );
    // Owner opens the complete account; ordinary farmers need fresh expanded consent.
    const { workspace, workspacePlants, workspaceReport } = await import(
      "../src/lib/server/farmer-workspace-service"
    );
    const opened = await workspace(services, farmer.uid, true);
    assert.equal(opened.farmer?.email, farmer.email);
    assert.equal(opened.cropCount, 1);
    let plants = await workspacePlants(services, farmer.uid, "crop-one");
    await write({
      action: "plant.update",
      uid: farmer.uid,
      cropId: "crop-one",
      plantId: "plant-one",
      version: plants.plants[0].version,
      name: "Plant A updated",
      age: "3 months",
      notes: "Owner plant notes",
    });
    await write(
      {
        action: "plant.update",
        uid: farmer.uid,
        cropId: "crop-one",
        plantId: "plant-one",
        version: plants.plants[0].version,
        name: "Stale",
        age: "",
        notes: "",
      },
      409,
    );
    assert.equal(
      (await workspacePlants(services, farmer.uid, "crop-one")).plants[0].name,
      "Plant A updated",
    );
    await db.doc(`users/${farmer.uid}/reports/report-one`).update({
      status: "Complete",
      symptoms: "Yellow leaves",
      email: "PRIVATE_EMAIL",
      phone: "PRIVATE_PHONE",
      weather: { location: "PRIVATE_ADDRESS" },
      history: [
        {
          action: "Saved report",
          changedAt: now,
          privateToken: "PRIVATE_TOKEN",
        },
      ],
      plan: {
        steps: [
          {
            title: "Saved step",
            description: "Saved care guidance",
            privateToken: "PRIVATE_TOKEN",
          },
        ],
      },
    });
    let reportDetail = await workspaceReport(
      services,
      farmer.uid,
      "report-one",
    );
    await write({
      action: "report.update",
      uid: farmer.uid,
      reportId: "report-one",
      version: reportDetail.version,
      disease: "Updated saved diagnosis",
      description: "Saved description",
      symptoms: "Yellow leaves",
      severity: "Low",
      careNotes: "Care note saved by owner",
      progress: "Improved",
    });
    assert.equal(
      (
        await db
          .doc(
            `users/${farmer.uid}/crops/crop-one/plants/plant-one/records/report-one`,
          )
          .get()
      ).data()?.diagnosis.disease,
      "Updated saved diagnosis",
    );
    assert.equal(
      (await workspaceReport(services, farmer.uid, "report-one")).history
        .length,
      2,
    );
    reportDetail = await workspaceReport(services, farmer.uid, "report-one");
    await write({
      action: "plan.update",
      uid: farmer.uid,
      reportId: "report-one",
      version: reportDetail.version,
      plan: {
        timeline: "One week",
        totalCost: 100,
        steps: [
          {
            title: "Saved step",
            description: "Owner reviewed care guidance",
            materials: [],
            timing: "Day 1",
            cost: 100,
            safetyNotes: "Follow the product label",
          },
        ],
        preventionTips: ["Monitor the plant"],
      },
    });
    assert.equal(
      (
        await db
          .doc(
            `users/${farmer.uid}/crops/crop-one/plants/plant-one/records/report-one`,
          )
          .get()
      ).data()?.diagnosis.plan.steps[0].stepNumber,
      1,
    );
    const share = async (action: unknown, status = 200) => {
      const response = await community.POST(request(farmerToken, action));
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
    };
    const otherToken = await signIn(other.email!);
    // The previous narrower permission must never silently share full account data.
    await db
      .doc(`community_profiles/${farmer.uid}`)
      .set({ name: "Old limited profile", city: "Lahore" });
    assert.deepEqual(
      (await (await community.GET(request(otherToken))).json()).farmers,
      [],
    );
    assert.equal(
      (
        await community.GET(
          request(otherToken, undefined, `?uid=${farmer.uid}`),
        )
      ).status,
      404,
    );
    await share({ action: "sharing.set", enabled: true, uid: other.uid }, 400);
    await share({ action: "sharing.set", enabled: true });
    const shared = await (
      await community.GET(request(otherToken, undefined, `?uid=${farmer.uid}`))
    ).json();
    assert.equal(shared.name, "Updated Farmer");
    assert.equal(shared.reportCount, 1);
    assert.equal(shared.farmer, undefined);
    assert.equal(shared.preferences, undefined);
    assert.ok(!JSON.stringify(shared).includes(farmer.email!));
    const sharedReport = await (
      await community.GET(
        request(
          otherToken,
          undefined,
          `?uid=${farmer.uid}&resource=workspace-report&report=report-one`,
        ),
      )
    ).json();
    assert.equal(sharedReport.plan.steps[0].title, "Saved step");
    assert.equal(sharedReport.progress, "Improved");
    assert.ok(!JSON.stringify(sharedReport).includes("PRIVATE"));
    assert.equal(
      (
        await community.GET(
          request(
            otherToken,
            undefined,
            `?uid=${farmer.uid}&resource=marketplace`,
          ),
        )
      ).status,
      403,
    );
    await share({ action: "report.delete", reportId: "report-one" }, 400);
    assert.equal(
      (
        await GET(
          request(
            otherToken,
            undefined,
            `?uid=${farmer.uid}&resource=workspace`,
          ),
        )
      ).status,
      403,
    );
    // Turning sharing off immediately denies every nested resource, but not directory browsing.
    await share({ action: "sharing.set", enabled: false });
    for (const query of [
      "",
      "&resource=plants&cropId=crop-one",
      "&resource=plant-records&cropId=crop-one&plantId=plant-one",
      "&resource=workspace-report&report=report-one",
    ])
      assert.equal(
        (
          await community.GET(
            request(otherToken, undefined, `?uid=${farmer.uid}${query}`),
          )
        ).status,
        404,
      );
    assert.equal((await community.GET(request(farmerToken))).status, 200);
    await share({ action: "sharing.set", enabled: true });
    // Resource ownership is checked on the server even for owner edits with a mismatched target UID.
    await db
      .doc("marketplace/other-listing")
      .set({ sellerId: other.uid, title: "Other crop", price: 100 });
    const foreign = await db.doc("marketplace/other-listing").get();
    const { recordVersion } = await import(
      "../src/lib/server/farmer-workspace-service"
    );
    await write(
      {
        action: "record.update",
        uid: farmer.uid,
        resource: "marketplace",
        recordId: foreign.id,
        version: recordVersion(foreign),
        values: { title: "Wrong target" },
      },
      403,
    );
    await db
      .doc("marketplace/test-listing")
      .set({ sellerId: farmer.uid, title: "Seed", price: 100, createdAt: now });
    let listing = await db.doc("marketplace/test-listing").get();
    await write(
      {
        action: "record.update",
        uid: farmer.uid,
        resource: "marketplace",
        recordId: listing.id,
        version: recordVersion(listing),
        values: { sellerId: other.uid },
      },
      400,
    );
    await write({
      action: "record.update",
      uid: farmer.uid,
      resource: "marketplace",
      recordId: listing.id,
      version: recordVersion(listing),
      values: { price: 125 },
    });
    listing = await listing.ref.get();
    assert.equal(listing.data()?.price, 125);
    await write({
      action: "record.delete",
      uid: farmer.uid,
      resource: "marketplace",
      recordId: listing.id,
      version: recordVersion(listing),
      confirmation: "DELETE",
    });
    // Deleting a report updates the plant pointer and count without removing earlier scans.
    const later = new Date(Date.now() + 1000).toISOString();
    await db.doc(`users/${farmer.uid}/reports/report-two`).set({
      cropId: "crop-one",
      plantId: "plant-one",
      plantRecordId: "report-two",
      disease: "Healthy",
      status: "Complete",
      createdAt: later,
    });
    await db
      .doc(
        `users/${farmer.uid}/crops/crop-one/plants/plant-one/records/report-two`,
      )
      .set({
        reportId: "report-two",
        createdAt: later,
        diagnosis: { disease: "Healthy" },
      });
    await db
      .doc(`users/${farmer.uid}/crops/crop-one/plants/plant-one`)
      .update({ recordCount: 2, latestRecordId: "report-two" });
    reportDetail = await workspaceReport(services, farmer.uid, "report-two");
    await write({
      action: "report.delete",
      uid: farmer.uid,
      reportId: "report-two",
      version: reportDetail.version,
      confirmation: "Healthy",
    });
    let remainingPlant = (
      await db.doc(`users/${farmer.uid}/crops/crop-one/plants/plant-one`).get()
    ).data()!;
    assert.equal(remainingPlant.recordCount, 1);
    assert.equal(remainingPlant.latestRecordId, "report-one");
    assert.equal(
      (await db.doc(`users/${farmer.uid}/reports/report-one`).get()).exists,
      true,
    );
    // A separate plant can be deleted without touching its sibling or another user's data.
    await db
      .doc(`users/${farmer.uid}/crops/crop-one/plants/delete-me`)
      .set({ name: "Disposable plant", createdAt: now });
    await db
      .doc(`users/${farmer.uid}/crops/crop-one`)
      .update({ plantCount: 2 });
    const disposable = await db
      .doc(`users/${farmer.uid}/crops/crop-one/plants/delete-me`)
      .get();
    await write({
      action: "plant.delete",
      uid: farmer.uid,
      cropId: "crop-one",
      plantId: "delete-me",
      version: recordVersion(disposable),
      confirmation: "Disposable plant",
    });
    assert.equal(
      (await db.doc(`users/${farmer.uid}/crops/crop-one`).get()).data()
        ?.plantCount,
      1,
    );
    detail = await farmerDetail(services, farmer.uid);
    await write(
      {
        action: "crop.delete",
        uid: farmer.uid,
        cropId: "crop-one",
        version: detail.crops[0].version,
        confirmation: "Wrong",
      },
      400,
    );
    await write({
      action: "crop.delete",
      uid: farmer.uid,
      cropId: "crop-one",
      version: detail.crops[0].version,
      confirmation: "Spring Wheat",
    });
    for (const path of [
      "crops/crop-one",
      "crops/crop-one/plants/plant-one",
      "crops/crop-one/plants/plant-one/records/report-one",
      "reports/report-one",
      "notifications/diagnosis_report-one",
    ])
      assert.equal(
        (await db.doc(`users/${farmer.uid}/${path}`).get()).exists,
        false,
        path,
      );
    assert.equal(
      (await db.doc(`users/${other.uid}/crops/keep`).get()).exists,
      true,
    );
    assert.equal(
      (await db.collection(`community_profiles/${farmer.uid}/cases`).get())
        .size,
      0,
    );
    const firestoreUrl = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-agriguard-owner/databases/(default)/documents`;
    const clientRead = (path: string) =>
      fetch(`${firestoreUrl}/${path}`, {
        headers: { Authorization: `Bearer ${farmerToken}` },
      });
    assert.equal((await clientRead(`profiles/${farmer.uid}`)).status, 200);
    assert.equal((await clientRead(`profiles/${other.uid}`)).status, 403);
    assert.equal(
      (await clientRead(`users/${other.uid}/crops/keep`)).status,
      403,
    );
    assert.equal((await clientRead("owner_audit")).status, 403);
    assert.equal(
      (await clientRead(`community_profiles/${farmer.uid}`)).status,
      403,
    );
    const escalation = await fetch(
      `${firestoreUrl}/account_controls/${farmer.uid}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${farmerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { disabled: { booleanValue: false } } }),
      },
    );
    assert.equal(escalation.status, 403);
    await write({ action: "account.suspend", uid: farmer.uid });
    assert.equal((await auth.getUser(farmer.uid)).disabled, true);
    assert.equal((await community.GET(request(farmerToken))).status, 401);
    assert.equal(
      (
        await community.GET(
          request(otherToken, undefined, `?uid=${farmer.uid}`),
        )
      ).status,
      404,
    );
    assert.equal((await clientRead(`profiles/${farmer.uid}`)).status, 403);
    await write({ action: "account.restore", uid: farmer.uid });
    assert.equal((await auth.getUser(farmer.uid)).disabled, false);
    await signIn(farmer.email!);
    await db
      .doc(`users/${farmer.uid}/crops/another/plants/child/records/saved`)
      .set({ createdAt: now });
    await db.doc("marketplace/farmer-listing").set({ sellerId: farmer.uid });
    await db.doc("supplier_contacts/contact").set({ userId: farmer.uid });
    await write(
      {
        action: "account.delete",
        uid: farmer.uid,
        confirmation: "incorrect@example.test",
      },
      400,
    );
    await write({
      action: "account.delete",
      uid: farmer.uid,
      confirmation: farmer.email,
    });
    await assert.rejects(auth.getUser(farmer.uid));
    assert.equal((await db.doc(`profiles/${farmer.uid}`).get()).exists, false);
    assert.equal(
      (await db.doc(`community_profiles/${farmer.uid}`).get()).exists,
      false,
    );
    assert.equal(
      (
        await db
          .doc(`users/${farmer.uid}/crops/another/plants/child/records/saved`)
          .get()
      ).exists,
      false,
    );
    assert.equal(
      (await db.doc("marketplace/farmer-listing").get()).exists,
      false,
    );
    assert.equal(
      (await db.doc("supplier_contacts/contact").get()).exists,
      false,
    );
    assert.equal(
      (await db.doc(`account_controls/${farmer.uid}`).get()).data()?.status,
      "deleted",
    );
    assert.equal((await auth.getUser(other.uid)).uid, other.uid);
    assert.ok(
      (
        await db
          .collection("owner_audit")
          .where("status", "==", "success")
          .get()
      ).size >= 6,
    );
    await auth.setCustomUserClaims(owner.uid, { admin: true });
    assert.equal(
      (await GET(request(ownerToken))).status,
      403,
      "removed owner role invalidates old sessions",
    );
    await db.terminate();
  },
);
