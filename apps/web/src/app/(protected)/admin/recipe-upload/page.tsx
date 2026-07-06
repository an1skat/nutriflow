import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { RecipeUploadWidget } from "@/widgets/recipe-upload/ui/RecipeUploadWidget";

export default function RecipeUploadPage() {
  return (
    <AccessGuard requiredPermissions={["recipes.manage"]}>
      <RecipeUploadWidget />
    </AccessGuard>
  );
}
