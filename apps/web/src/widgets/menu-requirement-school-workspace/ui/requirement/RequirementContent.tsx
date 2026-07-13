"use client";

import { Building2, Pencil, Save, Trash2, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  MenuRequirement,
  MenuRequirementCell,
  MenuRequirementIngredientRow,
  UpdateMenuRequirementPayload,
} from "@/entities/menu-requirement/model/MenuRequirement";
import type { AuthUser, UserRole } from "@/entities/session/model/Session";
import { AGE_GROUP_LABELS } from "@/entities/weekly-menu/model/WeeklyMenu";
import { MenuRequirementExportButton } from "@/features/menu-requirement-export/ui/MenuRequirementExportButton";
import { formatDate } from "@/shared/lib/FormatDate";
import { useConfirm } from "@/shared/ui/ConfirmDialog";

type RequirementSchoolGroup = {
  schoolId: string;
  schoolName: string;
  requirements: MenuRequirement[];
};

type RequirementAdminGroup = {
  adminKey: string;
  adminName: string;
  schools: RequirementSchoolGroup[];
};

type EditableRequirementRow = {
  key: string;
  ingredient_name: string;
  cells: MenuRequirementCell[];
};

export function RequirementNavigator({
  requirements,
  viewerRole,
  selectedId,
  onSelect,
}: {
  requirements: MenuRequirement[];
  viewerRole: UserRole;
  selectedId: string;
  onSelect: (requirementId: string) => void;
}) {
  const schoolGroups = groupRequirementsBySchool(requirements);
  const adminGroups = groupRequirementsByAdminAndSchool(requirements);
  const isSchoolUser = viewerRole === "SCHOOL_USER";
  const isAdmin = viewerRole === "ADMIN";

  return (
    <aside className="nf-panel overflow-hidden xl:sticky xl:top-4">
      <div className="nf-panel-header">
        <h2 className="nf-panel-title">
          {isSchoolUser ? "Меню-вимоги" : "Школи та меню-вимоги"}
        </h2>
      </div>
      <div className="max-h-[72vh] overflow-y-auto">
        {isSchoolUser ? (
          <RequirementList
            requirements={sortRequirements(requirements)}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ) : null}
        {isAdmin
          ? schoolGroups.map((school) => (
              <SchoolRequirementGroup
                key={school.schoolId}
                school={school}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))
          : null}
        {!isSchoolUser && !isAdmin
          ? adminGroups.map((adminGroup) => (
              <section
                key={adminGroup.adminKey}
                className="border-b border-slate-300 last:border-b-0"
              >
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                  <UserRound className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    Адміністратор: {adminGroup.adminName}
                  </span>
                </div>
                {adminGroup.schools.map((school) => (
                  <SchoolRequirementGroup
                    key={school.schoolId}
                    school={school}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </section>
            ))
          : null}
      </div>
    </aside>
  );
}

function SchoolRequirementGroup({
  school,
  selectedId,
  onSelect,
}: {
  school: RequirementSchoolGroup;
  selectedId: string;
  onSelect: (requirementId: string) => void;
}) {
  return (
    <div className="border-t border-slate-200 first:border-t-0">
      <div className="flex items-center gap-2 bg-white px-3 py-2 text-sm font-bold text-slate-900">
        <Building2
          className="size-4 shrink-0 text-emerald-700"
          aria-hidden
        />
        <span className="truncate">{school.schoolName}</span>
        <span className="ml-auto shrink-0 text-[11px] font-normal text-slate-500">
          {school.requirements.length}
        </span>
      </div>
      <RequirementList
        requirements={school.requirements}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}

function RequirementList({
  requirements,
  selectedId,
  onSelect,
}: {
  requirements: MenuRequirement[];
  selectedId: string;
  onSelect: (requirementId: string) => void;
}) {
  return (
    <div className="space-y-1 bg-slate-50 p-2">
      {requirements.map((requirement) => {
        const selected = requirement.id === selectedId;

        return (
          <button
            key={requirement.id}
            type="button"
            className={`w-full border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-200 bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50"
            }`}
            aria-pressed={selected}
            onClick={() => onSelect(requirement.id)}
          >
            <span className="block text-xs font-bold">
              {formatServiceDate(requirement.service_date)} ·{" "}
              {requirement.meal_type === "lunch" ? "Обід" : "Сніданок"}
            </span>
            <span
              className={`mt-1 block text-xs ${
                selected ? "text-emerald-50" : "text-slate-600"
              }`}
            >
              {requirement.school_group_name} · {requirement.menu_title}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MenuRequirementTable({
  requirement,
  showSchoolName = true,
  showAdministrator = false,
  editable = false,
  isSaving = false,
  onSave,
  deletable = false,
  isDeleting = false,
  onDelete,
}: {
  requirement: MenuRequirement;
  showSchoolName?: boolean;
  showAdministrator?: boolean;
  editable?: boolean;
  isSaving?: boolean;
  onSave?: (payload: UpdateMenuRequirementPayload) => Promise<void>;
  deletable?: boolean;
  isDeleting?: boolean;
  onDelete?: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<EditableRequirementRow[]>(() =>
    createEditableRows(requirement),
  );
  const canSubmit = editable && Boolean(onSave);
  const canDelete = deletable && Boolean(onDelete);

  const handleCancel = () => {
    setDraftRows(createEditableRows(requirement));
    setIsEditing(false);
  };

  const handleSave = async () => {
    const payload = buildUpdatePayload(draftRows);
    if (!payload) {
      toast.error("Перевірте назви інгредієнтів і грамовки.");
      return;
    }

    try {
      await onSave?.(payload);
      setIsEditing(false);
    } catch {
      // The workspace-level mutation already shows the API error toast.
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Видалити меню-вимогу?",
      description: `Меню-вимогу "${requirement.menu_title}" для групи ${requirement.school_group_name} буде видалено остаточно.`,
      confirmLabel: "Видалити",
      variant: "danger",
    });

    if (!confirmed) {
      return;
    }

    try {
      await onDelete?.();
    } catch {
      // The workspace-level mutation already shows the API error toast.
    }
  };

  return (
    <section className="nf-panel">
      <div className="nf-panel-header items-start">
        <div>
          <p className="nf-eyebrow">
            {showSchoolName
              ? requirement.school_name
              : requirement.school_group_name}
          </p>
          <h2 className="nf-panel-title">{requirement.menu_title}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {showSchoolName ? `${requirement.school_group_name} · ` : null}
            {formatServiceDate(requirement.service_date)} ·{" "}
            {AGE_GROUP_LABELS[requirement.age_group]} ·{" "}
            {requirement.meal_type === "lunch" ? "обід" : "сніданок"}
          </p>
          {showAdministrator ? (
            <p className="mt-1 text-xs text-slate-500">
              Адміністратор:{" "}
              {requirement.school_admin_owner_username ?? "не призначений"}
            </p>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>Версія {requirement.revision}</p>
          <p className="mt-1">
            Сформовано {formatDate(requirement.generated_at)}
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <MenuRequirementExportButton
              target={{
                kind: "requirement",
                requirementId: requirement.id,
              }}
              label="Експорт меню-вимоги"
              disabled={isSaving || isDeleting}
            />
            {canSubmit || canDelete ? (
              <>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="nf-button nf-button-secondary min-h-8 px-2 text-xs"
                      onClick={handleCancel}
                      disabled={isSaving || isDeleting}
                    >
                      <X className="size-4" aria-hidden />
                      Скасувати
                    </button>
                    <button
                      type="button"
                      className="nf-button nf-button-primary min-h-8 px-2 text-xs"
                      onClick={() => void handleSave()}
                      disabled={isSaving || isDeleting}
                    >
                      <Save className="size-4" aria-hidden />
                      {isSaving ? "Зберігаємо…" : "Зберегти"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="nf-button nf-button-secondary min-h-8 px-2 text-xs"
                    onClick={() => setIsEditing(true)}
                    disabled={isDeleting}
                  >
                    <Pencil className="size-4" aria-hidden />
                    Редагувати
                  </button>
                )}
                {canDelete ? (
                  <button
                    type="button"
                    className="nf-button nf-button-danger min-h-8 px-2 text-xs"
                    onClick={() => void handleDelete()}
                    disabled={isSaving || isDeleting}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {isDeleting ? "Видаляємо…" : "Видалити"}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto">
        <table className="w-max min-w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800">
              <th
                scope="col"
                className="w-52 min-w-52 max-w-52 whitespace-normal break-words border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-left"
              >
                Інгредієнт
              </th>
              {requirement.dishes.map((dish) => (
                <th
                  key={dish.menu_item_id}
                  scope="col"
                  className="w-32 min-w-32 max-w-32 whitespace-normal break-words border-b border-r border-slate-300 px-2 py-2 text-center align-top"
                >
                  <span className="block font-bold">{dish.name}</span>
                  <span className="mt-1 block text-xs font-normal text-slate-600">
                    Вихід: {dish.yield_amount} г
                  </span>
                  <span className="block text-xs font-normal text-slate-600">
                    Дітей: {dish.children_count}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="w-28 min-w-28 max-w-28 border-b border-r border-slate-300 bg-emerald-50 px-2 py-2 text-right align-top"
              >
                Разом на одну особу, г
              </th>
              <th
                scope="col"
                className="w-24 min-w-24 max-w-24 border-b border-slate-300 bg-emerald-100 px-2 py-2 text-right align-top"
              >
                До видачі, г ↑
              </th>
            </tr>
          </thead>
          <tbody>
            {requirement.ingredient_rows.map((row) => (
              <IngredientRow
                key={row.key}
                row={row}
                draftRow={
                  isEditing
                    ? draftRows.find((draftRow) => draftRow.key === row.key)
                    : undefined
                }
                dishIds={requirement.dishes.map((dish) => dish.menu_item_id)}
                isEditing={isEditing}
                onIngredientChange={(value) =>
                  setDraftRows((current) =>
                    updateDraftIngredientName(current, row.key, value),
                  )
                }
                onCellChange={(dishId, value) =>
                  setDraftRows((current) =>
                    updateDraftCell(current, row.key, dishId, value),
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        «До видачі» враховує окрему кількість дітей для кожної страви та
        округлюється вгору до цілого грама.
      </div>
    </section>
  );
}

function IngredientRow({
  row,
  draftRow,
  dishIds,
  isEditing,
  onIngredientChange,
  onCellChange,
}: {
  row: MenuRequirementIngredientRow;
  draftRow?: EditableRequirementRow;
  dishIds: string[];
  isEditing: boolean;
  onIngredientChange: (value: string) => void;
  onCellChange: (dishId: string, value: string) => void;
}) {
  const cells = useMemo(
    () => new Map(row.cells.map((cell) => [cell.menu_item_id, cell])),
    [row.cells],
  );
  const draftCells = useMemo(
    () =>
      new Map(
        (draftRow?.cells ?? []).map((cell) => [
          cell.menu_item_id,
          cell.net_per_person_g,
        ]),
      ),
    [draftRow?.cells],
  );

  return (
    <tr className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
      <th
        scope="row"
        className="w-52 min-w-52 max-w-52 whitespace-normal break-words border-r border-slate-300 bg-white px-2 py-1.5 text-left font-medium text-slate-900"
      >
        {isEditing ? (
          <textarea
            className="min-h-14 w-full resize-y border border-slate-300 bg-white px-2 py-1 text-xs leading-snug text-slate-900 focus:border-emerald-700 focus:outline-none"
            value={draftRow?.ingredient_name ?? row.ingredient_name}
            onChange={(event) => onIngredientChange(event.target.value)}
            aria-label={`Назва інгредієнта ${row.ingredient_name}`}
          />
        ) : (
          row.ingredient_name
        )}
      </th>
      {dishIds.map((dishId) => {
        const cell = cells.get(dishId);

        return (
          <td
            key={dishId}
            className="w-32 min-w-32 max-w-32 border-r border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700"
          >
            {isEditing ? (
              <input
                className="h-8 w-full border border-slate-300 bg-white px-1.5 text-right text-xs tabular-nums focus:border-emerald-700 focus:outline-none"
                inputMode="decimal"
                value={draftCells.get(dishId) ?? ""}
                onChange={(event) => onCellChange(dishId, event.target.value)}
                aria-label={`${row.ingredient_name}, грамів`}
              />
            ) : cell ? (
              formatGrams(cell.net_per_person_g)
            ) : (
              "—"
            )}
          </td>
        );
      })}
      <td className="w-28 min-w-28 max-w-28 border-r border-slate-300 bg-emerald-50/50 px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">
        {formatGrams(row.per_person_total_g)}
      </td>
      <td className="w-24 min-w-24 max-w-24 bg-emerald-100/60 px-2 py-1.5 text-right font-bold tabular-nums text-emerald-950">
        {formatInteger(row.issue_total_rounded_g)}
      </td>
    </tr>
  );
}

function createEditableRows(
  requirement: MenuRequirement,
): EditableRequirementRow[] {
  return requirement.ingredient_rows.map((row) => {
    const cells = new Map(
      row.cells.map((cell) => [cell.menu_item_id, cell.net_per_person_g]),
    );

    return {
      key: row.key,
      ingredient_name: row.ingredient_name,
      cells: requirement.dishes.map((dish) => ({
        menu_item_id: dish.menu_item_id,
        net_per_person_g: cells.get(dish.menu_item_id) ?? "0",
      })),
    };
  });
}

function updateDraftIngredientName(
  rows: EditableRequirementRow[],
  rowKey: string,
  value: string,
): EditableRequirementRow[] {
  return rows.map((row) =>
    row.key === rowKey ? { ...row, ingredient_name: value } : row,
  );
}

function updateDraftCell(
  rows: EditableRequirementRow[],
  rowKey: string,
  dishId: string,
  value: string,
): EditableRequirementRow[] {
  return rows.map((row) =>
    row.key === rowKey
      ? {
          ...row,
          cells: row.cells.map((cell) =>
            cell.menu_item_id === dishId
              ? { ...cell, net_per_person_g: value }
              : cell,
          ),
        }
      : row,
  );
}

function buildUpdatePayload(
  rows: EditableRequirementRow[],
): UpdateMenuRequirementPayload | null {
  const ingredientRows: UpdateMenuRequirementPayload["ingredient_rows"] = [];

  for (const row of rows) {
    const ingredientName = row.ingredient_name.trim();
    if (!ingredientName) {
      return null;
    }

    const cells: UpdateMenuRequirementPayload["ingredient_rows"][number]["cells"] =
      [];
    for (const cell of row.cells) {
      const normalizedAmount = normalizeDecimalDraft(cell.net_per_person_g);
      if (normalizedAmount === null) {
        return null;
      }

      cells.push({
        menu_item_id: cell.menu_item_id,
        net_per_person_g: normalizedAmount,
      });
    }

    ingredientRows.push({
      key: row.key,
      ingredient_name: ingredientName,
      cells,
    });
  }

  return { ingredient_rows: ingredientRows };
}

function normalizeDecimalDraft(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return "0";
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function formatServiceDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function filterRequirementsForUser(
  requirements: MenuRequirement[],
  user: AuthUser | null | undefined,
): MenuRequirement[] {
  if (!user) {
    return [];
  }
  if (user.role === "SCHOOL_USER") {
    return requirements.filter(
      (requirement) => requirement.school_id === user.school_id,
    );
  }
  if (user.role === "ADMIN") {
    return requirements.filter(
      (requirement) => requirement.school_admin_owner_id === user.id,
    );
  }
  return requirements;
}

function groupRequirementsBySchool(
  requirements: MenuRequirement[],
): RequirementSchoolGroup[] {
  const schools = new Map<string, RequirementSchoolGroup>();

  for (const requirement of requirements) {
    const school = schools.get(requirement.school_id) ?? {
      schoolId: requirement.school_id,
      schoolName: requirement.school_name,
      requirements: [],
    };

    school.requirements.push(requirement);
    schools.set(requirement.school_id, school);
  }

  return [...schools.values()]
    .map((school) => ({
      ...school,
      requirements: sortRequirements(school.requirements),
    }))
    .sort((left, right) =>
      left.schoolName.localeCompare(right.schoolName, "uk"),
    );
}

function sortRequirements(
  requirements: MenuRequirement[],
): MenuRequirement[] {
  return [...requirements].sort((left, right) => {
    const dateOrder = right.service_date.localeCompare(left.service_date);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    return left.school_group_name.localeCompare(right.school_group_name, "uk");
  });
}

function groupRequirementsByAdminAndSchool(
  requirements: MenuRequirement[],
): RequirementAdminGroup[] {
  const admins = new Map<
    string,
    {
      name: string;
      schools: Map<string, RequirementSchoolGroup>;
    }
  >();

  for (const requirement of requirements) {
    const adminKey =
      requirement.school_admin_owner_id ?? "unassigned-administrator";
    const adminName =
      requirement.school_admin_owner_username ?? "не призначений";
    const admin = admins.get(adminKey) ?? {
      name: adminName,
      schools: new Map<string, RequirementSchoolGroup>(),
    };
    const school = admin.schools.get(requirement.school_id) ?? {
      schoolId: requirement.school_id,
      schoolName: requirement.school_name,
      requirements: [],
    };

    school.requirements.push(requirement);
    admin.schools.set(requirement.school_id, school);
    admins.set(adminKey, admin);
  }

  return [...admins.entries()]
    .map(([adminKey, admin]) => ({
      adminKey,
      adminName: admin.name,
      schools: [...admin.schools.values()]
        .map((school) => ({
          ...school,
          requirements: [...school.requirements].sort((left, right) => {
            const dateOrder = right.service_date.localeCompare(
              left.service_date,
            );
            if (dateOrder !== 0) {
              return dateOrder;
            }
            return left.school_group_name.localeCompare(
              right.school_group_name,
              "uk",
            );
          }),
        }))
        .sort((left, right) =>
          left.schoolName.localeCompare(right.schoolName, "uk"),
        ),
    }))
    .sort((left, right) => {
      if (left.adminKey === "unassigned-administrator") {
        return 1;
      }
      if (right.adminKey === "unassigned-administrator") {
        return -1;
      }
      return left.adminName.localeCompare(right.adminName, "uk");
    });
}

function formatGrams(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 6,
  }).format(parsed);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  }).format(value);
}
