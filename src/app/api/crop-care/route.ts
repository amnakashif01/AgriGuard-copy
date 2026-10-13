import {
  checkOrigin,
  signedInAccount,
  ownerFailure,
  OwnerError,
} from "@/lib/server/owner-auth";
import { hasOwnerRole } from "@/lib/owner-admin";
import { requireSharing } from "@/lib/server/farmer-workspace-service";
import { careRead, careWrite } from "@/lib/server/crop-care-service";
import { careAction, careId } from "@/lib/crop-care/models";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
async function access(request: Request, write = false) {
  checkOrigin(request);
  const s = await signedInAccount(request),
    p = new URL(request.url).searchParams;
  for (const key of ["uid", "seasonId", "reportId", "eventId", "cursor"])
    if (p.has(key) && !careId.safeParse(p.get(key)).success)
      throw new OwnerError("Invalid record identifier.");
  if ((p.get("crop") || "").length > 64) throw new OwnerError("Invalid crop.");
  const uid = p.get("uid") || s.token.uid;
  const owner =
    hasOwnerRole(s.token) &&
    hasOwnerRole({ ...s.account.customClaims, email: s.account.email });
  const shared = p.get("scope") === "community";
  if (shared) {
    if (write) throw new OwnerError("Community records are read-only.", 403);
    await requireSharing(s, uid);
  } else if (uid !== s.token.uid && !owner)
    throw new OwnerError("This account is private.", 403);
  if (uid !== s.token.uid && !shared) {
    const account = await s.auth.getUser(uid).catch(() => null);
    if (!account) throw new OwnerError("Farmer not found.", 404);
  }
  return { s, p, uid, shared };
}
export async function GET(request: Request) {
  try {
    const { s, p, uid, shared } = await access(request);
    const resource = p.get("resource") || "seasons";
    if (
      ["history", "report", "context"].includes(resource) &&
      !p.get("reportId")
    )
      throw new OwnerError("Choose a report.");
    if (
      ["season", "reports", "events", "event-image", "season-detail"].includes(
        resource,
      ) &&
      !p.get("seasonId")
    )
      throw new OwnerError("Choose a season.");
    if (resource === "event-image" && !p.get("eventId"))
      throw new OwnerError("Choose a photo.");
    const result = await careRead(s, uid, p, shared);
    if (shared) await requireSharing(s, uid);
    return Response.json(result, { headers });
  } catch (error) {
    return ownerFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { s, uid } = await access(request, true);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new OwnerError("JSON is required.", 415);
    const body = await request.text();
    if (body.length > 120000)
      throw new OwnerError("Care entry is too large.", 413);
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new OwnerError("Invalid request.");
    }
    const parsed = careAction.safeParse(value);
    if (!parsed.success)
      throw new OwnerError(
        parsed.error.issues[0]?.message || "Check your entries.",
      );
    return Response.json(await careWrite(s, uid, s.token.uid, parsed.data), {
      headers,
    });
  } catch (error) {
    return ownerFailure(error);
  }
}
