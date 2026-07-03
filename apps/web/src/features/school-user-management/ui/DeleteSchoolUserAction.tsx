"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/shared/api/HttpClient";

import { useDeleteSchoolUser } from "../model/UseSchoolUserMutations";

type DeleteSchoolUserActionProps = {
  schoolId: string;
  userId: string;
  onDeleted: () => void;
};

export function DeleteSchoolUserAction({
  schoolId,
  userId,
  onDeleted,
}: DeleteSchoolUserActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const deleteUser = useDeleteSchoolUser(schoolId, userId);

  const handleDelete = async () => {
    try {
      await deleteUser.mutateAsync();
      onDeleted();
    } catch {
      // The mutation error is rendered below.
    }
  };

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="nf-button nf-button-danger"
      >
        Видалити користувача
      </button>
    );
  }

  return (
    <div className="border border-red-300 bg-red-50 p-3">
      <p className="text-xs leading-5 text-red-900">
        Обліковий запис і всі його сесії буде видалено без можливості
        відновлення.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleteUser.isPending}
          className="nf-button border-red-800 bg-red-700 text-white hover:bg-red-800"
        >
          {deleteUser.isPending ? "Видаляємо…" : "Підтвердити видалення"}
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          disabled={deleteUser.isPending}
          className="nf-button"
        >
          Скасувати
        </button>
      </div>
      {deleteUser.isError ? (
        <p role="alert" className="nf-field-error">
          {getApiErrorMessage(deleteUser.error)}
        </p>
      ) : null}
    </div>
  );
}
