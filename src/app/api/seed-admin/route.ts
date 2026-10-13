// Production records must always reflect real accounts and activity.
export async function GET() {
  return Response.json({ error: 'Demo data seeding is disabled.' }, { status: 410 });
}
