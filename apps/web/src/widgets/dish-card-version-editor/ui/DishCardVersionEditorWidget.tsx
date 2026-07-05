"use client";

import Link from "next/link";

import { useDishCardVersion } from "@/entities/recipe/api/RecipeQueries";
import { DishCardVersionForm } from "@/features/recipe-management/ui/DishCardVersionForm";
import { RequestError } from "@/shared/ui/RequestError";

type Props = {
  dishCardId: string;
  versionId?: string;
  mode: "create" | "edit";
};

export function DishCardVersionEditorWidget({ dishCardId, versionId, mode }: Props) {
  const versionQuery = useDishCardVersion(versionId ?? "");

  if (mode === "edit") {
    if (versionQuery.isPending) {
      return (
        <main className="nf-page">
          <p className="text-sm text-slate-600">Завантажуємо версію…</p>
        </main>
      );
    }
    if (versionQuery.isError || !versionQuery.data) {
      return (
        <main className="nf-page">
          <RequestError
            error={versionQuery.error ?? null}
            onRetry={() => void versionQuery.refetch()}
          />
        </main>
      );
    }
  }

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">
          <Link href={`/admin/recipe/dish-cards/${dishCardId}`} className="nf-link">
            Версії
          </Link>
          {" / "}
          {mode === "create" ? "Нова версія" : `Редагування версії`}
        </p>
        <h1 className="nf-title">
          {mode === "create" ? "Нова версія техкарти" : "Редагування версії"}
        </h1>
        <p className="nf-description">
          {mode === "create"
            ? "Створіть нову версію (draft). Після перевірки її можна підтвердити."
            : "Внесіть зміни до версії. Підтверджені та архівні версії незмінні."}
        </p>
      </header>

      <DishCardVersionForm
        dishCardId={dishCardId}
        version={mode === "edit" ? versionQuery.data : undefined}
        mode={mode}
      />
    </main>
  );
}
