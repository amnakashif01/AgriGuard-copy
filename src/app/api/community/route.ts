import { z } from "zod";
import {
  checkOrigin,
  signedInAccount,
  ownerFailure,
  OwnerError,
} from "@/lib/server/owner-auth";
import { ownerIdSchema } from "@/lib/owner-admin";
import { ownerRecords } from "@/lib/server/owner-service";
import {
  requireSharing,
  workspace,
  workspacePlants,
  workspacePlantRecords,
  workspaceReport,
  workspaceReports,
} from "@/lib/server/farmer-workspace-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const schema = z
  .object({ action: z.literal("sharing.set"), enabled: z.boolean() })
  .strict();
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";
function cityOnly(value: unknown) {
  return (
    clean(value, 160).match(
      /\b(Lahore|Islamabad|Rawalpindi|Karachi|Faisalabad|Multan|Peshawar|Quetta|Sialkot|Gujranwala|Hyderabad|Bahawalpur|Sargodha|Sukkur|Gujrat|Abbottabad|Murree|Mardan|Sahiwal|Okara|Sheikhupura|Kasur|Jhelum|Chakwal)\b/i,
    )?.[0] || ""
  );
}
export async function GET(request: Request) {
  try {
    checkOrigin(request);
    const services = await signedInAccount(request);
    const { db, token } = services;
    const params = new URL(request.url).searchParams;
    if (params.get("resource") === "mine") {
      const profile = await db.doc(`community_profiles/${token.uid}`).get();
      return Response.json(
        {
          enabled:
            profile.data()?.enabled === true &&
            profile.data()?.sharingVersion === 2,
          previouslyShared:
            profile.exists && profile.data()?.sharingVersion !== 2,
        },
        { headers },
      );
    }
    const uid = params.get("uid");
    if (uid) {
      for (const key of ["uid", "cursor", "cropId", "plantId", "report"])
        if (
          params.get(key) &&
          !ownerIdSchema.safeParse(params.get(key)).success
        )
          throw new OwnerError("Invalid record identifier.");
      await requireSharing(services, uid);
      const resource = params.get("resource") || "workspace",
        cursor = params.get("cursor") || undefined;
      let result: unknown;
      if (resource === "workspace")
        result = await workspace(services, uid, false);
      else if (resource === "workspace-reports")
        result = await workspaceReports(services, uid, cursor);
      else if (resource === "workspace-report" && params.get("report"))
        result = await workspaceReport(services, uid, params.get("report")!);
      else if (resource === "crops")
        result = await ownerRecords(services, uid, "crops", cursor);
      else if (resource === "plants" && params.get("cropId"))
        result = await workspacePlants(
          services,
          uid,
          params.get("cropId")!,
          cursor,
        );
      else if (
        resource === "plant-records" &&
        params.get("cropId") &&
        params.get("plantId")
      )
        result = await workspacePlantRecords(
          services,
          uid,
          params.get("cropId")!,
          params.get("plantId")!,
          cursor,
        );
      else throw new OwnerError("This section is private.", 403);
      await requireSharing(services, uid); // Respect revocation during an in-flight read.
      return Response.json(result, { headers });
    }
    const [profiles, controls] = await Promise.all([
      db.collection("community_profiles").get(),
      db.collection("account_controls").where("disabled", "==", true).get(),
    ]);
    const blocked = new Set(controls.docs.map((d) => d.id));
    const search = (params.get("search") || "").slice(0, 80).toLowerCase();
    const farmers = profiles.docs
      .filter(
        (d) =>
          d.data().enabled === true &&
          d.data().sharingVersion === 2 &&
          !blocked.has(d.id),
      )
      .map((d) => ({
        uid: d.id,
        name: clean(d.data().name, 80),
        city: clean(d.data().city, 80),
      }))
      .filter(
        (p) => !search || `${p.name} ${p.city}`.toLowerCase().includes(search),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ farmers }, { headers });
  } catch (error) {
    return ownerFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, token, account } = await signedInAccount(request);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new OwnerError("JSON is required.", 415);
    const raw = await request.text();
    if (raw.length > 1000) throw new OwnerError("Request is too large.", 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new OwnerError("Invalid request.");
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new OwnerError("Check the sharing setting.");
    const profile = await db.doc(`profiles/${token.uid}`).get();
    const now = new Date().toISOString();
    await db
      .doc(`community_profiles/${token.uid}`)
      .set(
        {
          enabled: parsed.data.enabled,
          sharingVersion: 2,
          name: clean(
            profile.data()?.name || account.displayName || "Farmer",
            80,
          ),
          city: cityOnly(profile.data()?.location),
          updatedAt: now,
          ...(parsed.data.enabled ? { consentAt: now } : {}),
        },
        { merge: true },
      );
    await db
      .collection(`users/${token.uid}/logs`)
      .add({
        agentName: "account",
        action: parsed.data.enabled
          ? "Community sharing enabled"
          : "Community sharing disabled",
        status: "info",
        timestamp: now,
      });
    return Response.json(
      { success: true, enabled: parsed.data.enabled },
      { headers },
    );
  } catch (error) {
    return ownerFailure(error);
  }
}
