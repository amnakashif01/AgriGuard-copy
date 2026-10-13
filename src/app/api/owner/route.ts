import { requireOwner, OwnerError, ownerFailure } from '@/lib/server/owner-auth';
import { ownerOverview, farmerDetail, ownerReport, ownerRecords, ownerMutation } from '@/lib/server/owner-service';
import { ownerActionSchema, ownerIdSchema } from '@/lib/owner-admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  try {
    const services = await requireOwner(request);
    const params = new URL(request.url).searchParams;
    const uid = params.get('uid');
    if (params.get('resource') === 'session') return Response.json({ owner: true }, { headers });
    if (uid) {
      if (!ownerIdSchema.safeParse(uid).success) throw new OwnerError('Invalid farmer identifier.');
      const resource = params.get('resource');
      if (resource === 'crops' || resource === 'reports') {
        const cursor = params.get('cursor') || undefined;
        if (cursor && !ownerIdSchema.safeParse(cursor).success) throw new OwnerError('Invalid record cursor.');
        return Response.json(await ownerRecords(services, uid, resource, cursor), { headers });
      }
      const report = params.get('report');
      if (report && !ownerIdSchema.safeParse(report).success) throw new OwnerError('Invalid report identifier.');
      return Response.json(report ? await ownerReport(services, uid, report) : await farmerDetail(services, uid), { headers });
    }
    const page = Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1));
    return Response.json(await ownerOverview(services, (params.get('search') || '').slice(0,160), page, params.get('filter') || 'all'), { headers });
  } catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request) {
  try {
    const services = await requireOwner(request);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new OwnerError('JSON is required.', 415);
    const body = await request.text();
    if (body.length > 12000) throw new OwnerError('Request is too large.', 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new OwnerError('Invalid request.'); }
    const parsed = ownerActionSchema.safeParse(input);
    if (!parsed.success) throw new OwnerError(parsed.error.issues[0]?.message || 'Check the supplied fields.');
    return Response.json(await ownerMutation(services, services.account, parsed.data), { headers });
  } catch (error) { return ownerFailure(error); }
}
