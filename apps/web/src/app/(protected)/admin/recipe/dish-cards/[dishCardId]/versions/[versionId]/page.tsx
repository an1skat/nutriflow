import { DishCardVersionDetailsWidget } from "@/widgets/dish-card-version-details/ui/DishCardVersionDetailsWidget";

type VersionPageProps = {
  params: Promise<{
    dishCardId: string;
    versionId: string;
  }>;
};

export default async function VersionPage({ params }: VersionPageProps) {
  const { dishCardId, versionId } = await params;
  return <DishCardVersionDetailsWidget dishCardId={dishCardId} versionId={versionId} />;
}
