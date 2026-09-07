'use client';

import Link from 'next/link';

import { toast } from 'sonner';

import { useDishCard, useDishCardVersions } from '@/entities/recipe/api/RecipeQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { hasPermission } from '@/features/access/model/AccessPolicy';
import { useSetMainDishCardVersion } from '@/features/recipe-management/model/UseRecipeMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Чернетка',
  import_preview: 'Превʼю імпорту',
  confirmed: 'Підтверджено',
  archived: 'Архів',
};

export function DishCardVersionsWidget({ dishCardId }: { dishCardId: string }) {
  const dishCard = useDishCard(dishCardId);
  const versions = useDishCardVersions(dishCardId);
  const currentUser = useCurrentUser();
  const setMainVersion = useSetMainDishCardVersion();
  const canManage = Boolean(currentUser.data && hasPermission(currentUser.data, 'recipes.manage'));
  const canSelectMain =
    currentUser.data?.role === 'OWNER' || currentUser.data?.role === 'TECHNOLOGIST';

  const handleSelectMain = async (versionId: string) => {
    try {
      await setMainVersion.mutateAsync(versionId);
      toast.success('Основну версію змінено.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (dishCard.isPending || versions.isPending) {
    return (
      <main className="nf-page">
        <LoadingSpinner label="Завантажуємо техкарту…" />
      </main>
    );
  }

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">
          <Link href="/admin/recipe" className="nf-link">
            Каталог
          </Link>
          {' / Техкарта'}
        </p>
        <h1 className="nf-title">{dishCard.data?.name ?? 'Техкарта'}</h1>
        <p className="nf-description">
          {dishCard.data ? (
            <>
              Номер <code className="text-xs">{dishCard.data.card_number}</code>
              {dishCard.data.category ? <> · {dishCard.data.category}</> : null}
            </>
          ) : null}
        </p>
      </header>

      {canManage ? (
        <div className="mb-4 flex gap-2">
          <Link
            href={`/admin/recipe/dish-cards/${dishCardId}/versions/new`}
            className="nf-button nf-button-primary"
          >
            Створити нову версію
          </Link>
          <Link href="/admin/recipe-upload" className="nf-button nf-button-secondary">
            Завантажити нову техкарту
          </Link>
        </div>
      ) : null}

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Версії</h2>
          {versions.data ? (
            <p className="mt-0.5 text-xs text-slate-600">Версій: {versions.data.total}</p>
          ) : null}
        </div>
        <div className="nf-panel-body">
          {dishCard.isError || versions.isError ? (
            <RequestError
              error={dishCard.error ?? versions.error ?? null}
              onRetry={() => {
                void dishCard.refetch();
                void versions.refetch();
              }}
            />
          ) : null}
          {versions.data?.items.length === 0 ? (
            <div className="nf-empty">Версій ще немає.</div>
          ) : null}
          {versions.data?.items.length ? (
            <div className="nf-table-wrap">
              <table className="nf-table">
                <thead>
                  <tr>
                    <th className="w-20">Версія</th>
                    <th className="w-40">Статус</th>
                    <th className="w-32">Порцій</th>
                    <th className="w-32">Інгредієнтів</th>
                    <th className="w-52">Оновлено</th>
                    <th className="w-48">Для розрахунків</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.data.items.map((v) => {
                    const isCurrent = dishCard.data?.current_version_id === v.id;
                    return (
                      <tr key={v.id}>
                        <td>
                          <Link
                            href={`/admin/recipe/dish-cards/${dishCardId}/versions/${v.id}`}
                            className="nf-link"
                          >
                            v{v.version}
                            {isCurrent ? (
                              <span className="ml-1 text-xs text-emerald-700">●</span>
                            ) : null}
                          </Link>
                        </td>
                        <td className="text-xs">{STATUS_LABELS[v.status] ?? v.status}</td>
                        <td className="text-xs text-slate-600">{v.portion_variants.length}</td>
                        <td className="text-xs text-slate-600">{v.ingredient_amounts.length}</td>
                        <td className="whitespace-nowrap text-xs text-slate-600">{v.updated_at}</td>
                        <td>
                          {isCurrent ? (
                            <span className="text-xs font-bold text-emerald-700">Основна</span>
                          ) : canSelectMain && v.status === 'confirmed' ? (
                            <button
                              type="button"
                              className="nf-button nf-button-secondary"
                              disabled={setMainVersion.isPending}
                              onClick={() => void handleSelectMain(v.id)}
                            >
                              Зробити основною
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
