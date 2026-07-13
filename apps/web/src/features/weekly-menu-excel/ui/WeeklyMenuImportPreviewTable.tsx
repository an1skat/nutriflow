import { WeeklyMenuNutritionTable } from "@/entities/weekly-menu/ui/WeeklyMenuNutritionTable";

import type { WeeklyMenuImportMenu } from "../model/WeeklyMenuExcel";

export function WeeklyMenuImportPreviewTable({
  menu,
}: {
  menu: WeeklyMenuImportMenu;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <WeeklyMenuNutritionTable days={menu.days} />
    </div>
  );
}
