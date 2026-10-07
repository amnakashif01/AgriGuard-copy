import { PlantsPage } from '@/components/my-crops/plants-page';
export default async function Page({ params }: { params: Promise<{ cropId: string }> }) { const { cropId } = await params; return <PlantsPage cropId={cropId} />; }
