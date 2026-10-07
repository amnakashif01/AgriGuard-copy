import { RecordForm } from '@/components/my-crops/record-form';
export default async function Page({ params }: { params: Promise<{ cropId: string }> }) { const { cropId } = await params; return <RecordForm cropId={cropId} />; }
