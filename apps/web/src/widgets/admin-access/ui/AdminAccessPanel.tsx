"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAdminUsers } from "@/entities/admin-user/api/AdminUserQueries";
import type { AdminUser } from "@/entities/admin-user/model/AdminUser";
import type { AdminPermission } from "@/entities/session/model/Session";
import {
  adminPermissionOptions,
} from "@/features/admin-access-management/model/AdminAccessSchemas";
import {
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/features/admin-access-management/model/UseAdminAccessMutations";
import { CreateAdminUserForm } from "@/features/admin-access-management/ui/CreateAdminUserForm";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { formatDate } from "@/shared/lib/FormatDate";
import { PaginationControls } from "@/shared/ui/PaginationControls";
import { RequestError } from "@/shared/ui/RequestError";
import { StatusBadge } from "@/shared/ui/StatusBadge";

const PAGE_SIZE = 20;

export function AdminAccessPanel() {
  const [offset, setOffset] = useState(0);
  const admins = useAdminUsers({
    offset,
    limit: PAGE_SIZE,
  });

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Адміністрування</p>
        <h1 className="nf-title">Доступ</h1>
        <p className="nf-description">
          Створення нижніх адміністраторів і керування їхніми правами.
        </p>
      </header>

      <section aria-labelledby="create-admin-heading" className="nf-panel">
        <div className="nf-panel-header">
          <h2 id="create-admin-heading" className="nf-panel-title">
            Додати адміністратора
          </h2>
        </div>
        <div className="nf-panel-body">
          <CreateAdminUserForm />
        </div>
      </section>

      <section aria-labelledby="admin-list-heading" className="nf-panel mt-5">
        <div className="nf-panel-header">
          <div>
            <h2 id="admin-list-heading" className="nf-panel-title">
              Нижні адміністратори
            </h2>
            {admins.data ? (
              <p className="mt-0.5 text-xs text-slate-600">
                Записів: {admins.data.total}
              </p>
            ) : null}
          </div>
        </div>

        <div className="nf-panel-body">
          {admins.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо адміністраторів…
            </p>
          ) : null}

          {admins.isError ? (
            <RequestError
              error={admins.error}
              onRetry={() => void admins.refetch()}
            />
          ) : null}

          {admins.data?.items.length === 0 ? (
            <div className="nf-empty">Нижніх адміністраторів ще немає.</div>
          ) : null}

          {admins.data?.items.length ? (
            <div className="grid gap-3">
              {admins.data.items.map((admin) => (
                <AdminUserAccessRow key={admin.id} admin={admin} />
              ))}
            </div>
          ) : null}

          {admins.data ? (
            <PaginationControls
              offset={offset}
              limit={PAGE_SIZE}
              total={admins.data.total}
              disabled={admins.isFetching}
              onOffsetChange={setOffset}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function AdminUserAccessRow({ admin }: { admin: AdminUser }) {
  const updateAdmin = useUpdateAdminUser(admin.id);
  const deleteAdmin = useDeleteAdminUser(admin.id);

  const handlePermissionChange = async (
    permission: AdminPermission,
    checked: boolean,
  ) => {
    const nextPermissions = checked
      ? [...admin.permissions, permission]
      : admin.permissions.filter((item) => item !== permission);

    try {
      await updateAdmin.mutateAsync({
        permissions: Array.from(new Set(nextPermissions)),
      });
      toast.success("Права оновлено.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleActiveChange = async () => {
    try {
      await updateAdmin.mutateAsync({
        is_active: !admin.is_active,
      });
      toast.success("Статус оновлено.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Видалити адміністратора ${admin.username}?`)) {
      return;
    }

    try {
      await deleteAdmin.mutateAsync();
      toast.success("Адміністратора видалено.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <article className="border border-[var(--nf-line)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {admin.username}
          </h3>
          <p className="mt-1 text-xs text-slate-600">{admin.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            Оновлено: {formatDate(admin.updated_at)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge isActive={admin.is_active} />
          <button
            type="button"
            onClick={() => void handleActiveChange()}
            disabled={updateAdmin.isPending}
            className="nf-button nf-button-secondary"
          >
            {admin.is_active ? "Деактивувати" : "Активувати"}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleteAdmin.isPending}
            className="flex size-9 items-center justify-center border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            aria-label={`Видалити ${admin.username}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {adminPermissionOptions.map((permission) => (
          <label
            key={permission.value}
            className="flex min-h-11 items-center gap-2 border border-[var(--nf-line)] px-3 text-sm"
          >
            <input
              type="checkbox"
              checked={admin.permissions.includes(permission.value)}
              disabled={updateAdmin.isPending}
              onChange={(event) =>
                void handlePermissionChange(
                  permission.value,
                  event.target.checked,
                )
              }
              className="size-4"
            />
            <span>{permission.label}</span>
          </label>
        ))}
      </div>
    </article>
  );
}
