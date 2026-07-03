"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  getApiErrorMessage,
  isHttpStatus,
} from "@/shared/api/HttpClient";

import {
  deleteSchoolFormSchema,
  type DeleteSchoolFormValues,
} from "../model/SchoolFormSchema";
import { useDeleteSchool } from "../model/UseSchoolMutations";

type DeleteSchoolActionProps = {
  schoolId: string;
  onDeleted: () => void;
};

const DELETE_CONFIRMATION_STORAGE_KEY =
  "nutriflow:admin-delete-confirmed-until";
const DELETE_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

function getRecentDeleteConfirmation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const expiresAt = Number(
    window.localStorage.getItem(DELETE_CONFIRMATION_STORAGE_KEY),
  );

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    window.localStorage.removeItem(DELETE_CONFIRMATION_STORAGE_KEY);
    return false;
  }

  return true;
}

function rememberDeleteConfirmation(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DELETE_CONFIRMATION_STORAGE_KEY,
    String(Date.now() + DELETE_CONFIRMATION_TTL_MS),
  );
}

function clearDeleteConfirmation(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(DELETE_CONFIRMATION_STORAGE_KEY);
}

export function DeleteSchoolAction({
  schoolId,
  onDeleted,
}: DeleteSchoolActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(true);
  const deleteSchool = useDeleteSchool(schoolId);
  const form = useForm<DeleteSchoolFormValues>({
    resolver: zodResolver(deleteSchoolFormSchema),
    defaultValues: {
      password: "",
    },
  });

  const handleDelete = async (
    values: DeleteSchoolFormValues | undefined,
    usedRecentConfirmation: boolean,
  ) => {
    form.clearErrors("root");

    try {
      await deleteSchool.mutateAsync(values);

      if (values?.password) {
        rememberDeleteConfirmation();
      }

      form.reset();
      onDeleted();
    } catch (error) {
      if (usedRecentConfirmation && isHttpStatus(error, 403)) {
        clearDeleteConfirmation();
        setPasswordRequired(true);
        form.setError("root", {
          type: "server",
          message: "Потрібно ще раз підтвердити пароль адміністратора.",
        });
        return;
      }

      form.setError("root", {
        type: "server",
        message: getApiErrorMessage(error),
      });
    }
  };

  const onSubmit = form.handleSubmit((values) => handleDelete(values, false));

  const startConfirmation = () => {
    form.clearErrors("root");
    setPasswordRequired(!getRecentDeleteConfirmation());
    setIsConfirming(true);
  };

  const cancelConfirmation = () => {
    form.reset();
    deleteSchool.reset();
    setIsConfirming(false);
  };

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={startConfirmation}
        className="nf-button nf-button-danger"
      >
        Видалити школу
      </button>
    );
  }

  if (!passwordRequired) {
    return (
      <div className="border border-red-300 bg-red-50 p-3">
        <p className="text-xs leading-5 text-red-900">
          Школу буде видалено разом з усіма користувачами. Після цього вони не
          зможуть увійти в систему, а повернути школу з цього екрана не можна.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDelete(undefined, true)}
            disabled={deleteSchool.isPending}
            className="nf-button border-red-800 bg-red-700 text-white hover:bg-red-800"
          >
            {deleteSchool.isPending ? "Видаляємо…" : "Підтвердити видалення"}
          </button>
          <button
            type="button"
            onClick={cancelConfirmation}
            disabled={deleteSchool.isPending}
            className="nf-button"
          >
            Скасувати
          </button>
        </div>

        {form.formState.errors.root ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.root.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-red-300 bg-red-50 p-3">
      <p className="text-xs leading-5 text-red-900">
        Школу буде видалено разом з усіма користувачами. Після цього вони не
        зможуть увійти в систему, а повернути школу з цього екрана не можна.
      </p>

      <div className="mt-3">
        <label
          htmlFor={`delete-school-password-${schoolId}`}
          className="nf-label"
        >
          Пароль адміністратора
        </label>
        <input
          id={`delete-school-password-${schoolId}`}
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
          className="nf-input"
        />
        {form.formState.errors.password ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="nf-button border-red-800 bg-red-700 text-white hover:bg-red-800"
        >
          {form.formState.isSubmitting
            ? "Видаляємо…"
            : "Підтвердити видалення"}
        </button>
        <button
          type="button"
          onClick={cancelConfirmation}
          disabled={form.formState.isSubmitting}
          className="nf-button"
        >
          Скасувати
        </button>
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-field-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
    </form>
  );
}
