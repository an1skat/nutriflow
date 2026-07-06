import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { DishCardVersionEditorWidget } from "@/widgets/dish-card-version-editor/ui/DishCardVersionEditorWidget";

type NewVersionPageProps = {
  params: Promise<{
    dishCardId: string;
  }>;
};

export default async function NewVersionPage({ params }: NewVersionPageProps) {
  const { dishCardId } = await params;
  return (
    <AccessGuard requiredPermissions={["recipes.manage"]}>
      <DishCardVersionEditorWidget dishCardId={dishCardId} mode="create" />
    </AccessGuard>
  );
}
