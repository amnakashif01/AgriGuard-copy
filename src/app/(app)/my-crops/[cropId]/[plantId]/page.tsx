import { TimelinePage } from '@/components/my-crops/timeline-page';
export default async function Page({ params }: { params: Promise<{ cropId: string; plantId: string }> }) { const { cropId, plantId } = await params; return <TimelinePage cropId={cropId} plantId={plantId} />; }
