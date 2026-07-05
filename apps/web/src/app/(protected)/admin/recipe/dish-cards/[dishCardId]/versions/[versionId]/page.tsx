import { DishCardVersionEditorWidget } from "@/widgets/dish-card-version-editor/ui/DishCardVersionEditorWidget";

type VersionPageProps = {
  params: Promise<{
    dishCardId: string;
    versionId: string;
  }>;
};

export default async function VersionPage({ params }: VersionPageProps) {
  const { dishCardId, versionId } = await params;
  return (
    <DishCardVersionEditorWidget dishCardId={dishCardId} versionId={versionId} mode="edit" />
  );
}
