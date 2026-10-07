import { RecordForm } from '@/components/my-crops/record-form';
export default async function Page({ params }: { params: Promise<{ cropId: string; plantId: string }> }) { const { cropId, plantId } = await params; return <RecordForm cropId={cropId} plantId={plantId} />; }
