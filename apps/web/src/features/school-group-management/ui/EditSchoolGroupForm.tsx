"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import type { SchoolGroup } from "@/entities/school-group/model/SchoolGroup";
import { getApiErrorMessage } from "@/shared/api/HttpClient";

import {
  editSchoolGroupFormSchema,
  type EditSchoolGroupFormValues,
} from "../model/SchoolGroupFormSchemas";
import { useUpdateSchoolGroup } from "../model/UseSchoolGroupMutations";

type EditSchoolGroupFormProps = {
  schoolId: string;
  group: SchoolGroup;
};

export function EditSchoolGroupForm({
  schoolId,
  group,
}: EditSchoolGroupFormProps) {
  const updateGroup = useUpdateSchoolGroup(schoolId, group.id);
  const form = useForm<EditSchoolGroupFormValues>({
    resolver: zodResolver(editSchoolGroupFormSchema),
    defaultValues: {
      name: group.name,
      is_active: group.is_active,
    },
  });

  useEffect(() => {
    form.reset({
      name: group.name,
      is_active: group.is_active,
    });
  }, [form, group]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");

    try {
      await updateGroup.mutateAsync(values);
    } catch (error) {
      form.setError("root", {
        type: "server",
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <div>
          <label htmlFor={`group-${group.id}-name`} className="nf-label">
            Назва групи
          </label>
          <input
            id={`group-${group.id}-name`}
            {...form.register("name")}
            className="nf-input"
          />
          {form.formState.errors.name ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>
      </div>

      <label className="nf-checkbox-row">
        <input
          type="checkbox"
          {...form.register("is_active")}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="block text-sm font-bold">Група активна</span>
          <span className="block text-xs text-slate-600">
            Неактивні групи не будуть доступні для майбутнього денного обліку.
          </span>
        </span>
      </label>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {updateGroup.isSuccess ? (
        <p role="status" className="nf-success">
          Групу оновлено.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="nf-button nf-button-primary"
      >
        {form.formState.isSubmitting ? "Зберігаємо…" : "Зберегти групу"}
      </button>
    </form>
  );
}
