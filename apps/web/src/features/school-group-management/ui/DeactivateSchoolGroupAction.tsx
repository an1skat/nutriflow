"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/shared/api/HttpClient";

import { useDeactivateSchoolGroup } from "../model/UseSchoolGroupMutations";

type DeactivateSchoolGroupActionProps = {
  schoolId: string;
  groupId: string;
  disabled?: boolean;
};

export function DeactivateSchoolGroupAction({
  schoolId,
  groupId,
  disabled = false,
}: DeactivateSchoolGroupActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const deactivateGroup = useDeactivateSchoolGroup(schoolId, groupId);

  const handleDeactivate = async () => {
    try {
      await deactivateGroup.mutateAsync();
      setIsConfirming(false);
    } catch {
      // The mutation error is rendered below.
    }
  };

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        disabled={disabled}
        className="nf-button nf-button-danger"
      >
        Деактивувати
      </button>
    );
  }

  return (
    <div className="border border-red-300 bg-red-50 p-3">
      <p className="text-xs leading-5 text-red-900">
        Група залишиться в історії школи, але не буде активною для подальших
        розрахунків.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleDeactivate()}
          disabled={deactivateGroup.isPending}
          className="nf-button border-red-800 bg-red-700 text-white hover:bg-red-800"
        >
          {deactivateGroup.isPending
            ? "Деактивуємо…"
            : "Підтвердити деактивацію"}
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          disabled={deactivateGroup.isPending}
          className="nf-button"
        >
          Скасувати
        </button>
      </div>
      {deactivateGroup.isError ? (
        <p role="alert" className="nf-field-error">
          {getApiErrorMessage(deactivateGroup.error)}
        </p>
      ) : null}
    </div>
  );
}
