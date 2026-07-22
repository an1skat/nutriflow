'use client';

import Link from 'next/link';

import { useDishCard, useDishCardVersion } from '@/entities/recipe/api/RecipeQueries';
import { DishCardVersionForm } from '@/features/recipe-management/ui/DishCardVersionForm';
import { RequestError } from '@/shared/ui/RequestError';

type Props = {
  dishCardId: string;
  versionId?: string;
  mode: 'create' | 'edit';
};

export function DishCardVersionEditorWidget({ dishCardId, versionId, mode }: Props) {
  const dishCardQuery = useDishCard(dishCardId);
  const versionQuery = useDishCardVersion(versionId ?? '');
  const sourceVersionId = mode === 'create' ? (dishCardQuery.data?.current_version_id ?? '') : '';
  const sourceVersionQuery = useDishCardVersion(sourceVersionId);

  if (mode === 'edit') {
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

  if (mode === 'create') {
    if (dishCardQuery.isPending || (sourceVersionId && sourceVersionQuery.isPending)) {
      return (
        <main className="nf-page">
          <p className="text-sm text-slate-600">Завантажуємо поточну версію…</p>
        </main>
      );
    }
    if (dishCardQuery.isError || (sourceVersionId && sourceVersionQuery.isError)) {
      return (
        <main className="nf-page">
          <RequestError
            error={dishCardQuery.error ?? sourceVersionQuery.error ?? null}
            onRetry={() => {
              void dishCardQuery.refetch();
              if (sourceVersionId) {
                void sourceVersionQuery.refetch();
              }
            }}
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
          {' / '}
          {mode === 'create' ? 'Нова версія' : `Редагування версії`}
        </p>
        <h1 className="nf-title">
          {mode === 'create' ? 'Нова версія техкарти' : 'Редагування версії'}
        </h1>
        <p className="nf-description">
          {mode === 'create'
            ? sourceVersionQuery.data
              ? 'Нова версія створюється на основі поточної. Внесіть потрібні зміни й збережіть draft.'
              : 'Створіть нову версію (draft). Після перевірки її можна підтвердити.'
            : 'Внесіть зміни до версії. Підтверджені та архівні версії незмінні.'}
        </p>
      </header>

      <DishCardVersionForm
        dishCardId={dishCardId}
        version={mode === 'edit' ? versionQuery.data : sourceVersionQuery.data}
        mode={mode}
      />
    </main>
  );
}
