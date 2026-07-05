"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateAdminSchoolGroup } from "@/entities/school-group/api/SchoolGroupApi";
import { schoolGroupQueryKeys } from "@/entities/school-group/api/SchoolGroupQueries";
import type { AgeGroup } from "@/entities/school-group/model/SchoolGroup";

import type {
  EditSchoolGroupFormValues,
  SchoolGroupFormValues,
} from "./SchoolGroupFormSchemas";

export function useUpdateSchoolGroup(schoolId: string, groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: EditSchoolGroupFormValues) =>
      updateAdminSchoolGroup(schoolId, groupId, {
        name: values.name,
        is_active: values.is_active,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolGroupQueryKeys.adminLists(schoolId),
      });
    },
  });
}

export function useRestoreSchoolGroup(
  schoolId: string,
  groupsByAge: Partial<Record<AgeGroup, string>>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: SchoolGroupFormValues) => {
      const groupId = groupsByAge[values.age_group];

      if (!groupId) {
        throw new Error("Ця вікова група ще не створена на сервері.");
      }

      return updateAdminSchoolGroup(schoolId, groupId, {
        name: values.name,
        is_active: true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolGroupQueryKeys.adminLists(schoolId),
      });
    },
  });
}

export function useDeactivateSchoolGroup(schoolId: string, groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      updateAdminSchoolGroup(schoolId, groupId, {
        is_active: false,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolGroupQueryKeys.adminLists(schoolId),
      });
    },
  });
}
