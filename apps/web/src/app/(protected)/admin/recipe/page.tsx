import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { RecipeCatalogWidget } from "@/widgets/recipe-catalog/ui/RecipeCatalogWidget";

type RecipeCatalogPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
    query?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RecipeCatalogPage({ searchParams }: RecipeCatalogPageProps) {
  const params = searchParams ? await searchParams : {};
  const tab = firstParam(params.tab);
  const initialTab =
    tab === "ingredients" || tab === "allergens" || tab === "dish-cards"
      ? tab
      : "dish-cards";

  return (
    <AccessGuard requiredPermissions={["recipes.manage"]}>
      <RecipeCatalogWidget
        initialTab={initialTab}
        initialQuery={firstParam(params.query) ?? ""}
      />
    </AccessGuard>
  );
}
