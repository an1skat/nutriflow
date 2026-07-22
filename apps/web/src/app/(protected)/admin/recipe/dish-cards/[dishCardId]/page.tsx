import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { DishCardVersionsWidget } from '@/widgets/dish-card-versions/ui/DishCardVersionsWidget';

type DishCardPageProps = {
  params: Promise<{
    dishCardId: string;
  }>;
};

export default async function DishCardPage({ params }: DishCardPageProps) {
  const { dishCardId } = await params;
  return (
    <AccessGuard requiredPermissions={['recipes.view']}>
      <DishCardVersionsWidget dishCardId={dishCardId} />
    </AccessGuard>
  );
}
