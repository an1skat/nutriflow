import { DishCardVersionEditorWidget } from "@/widgets/dish-card-version-editor/ui/DishCardVersionEditorWidget";

type NewVersionPageProps = {
  params: Promise<{
    dishCardId: string;
  }>;
};

export default async function NewVersionPage({ params }: NewVersionPageProps) {
  const { dishCardId } = await params;
  return <DishCardVersionEditorWidget dishCardId={dishCardId} mode="create" />;
}
