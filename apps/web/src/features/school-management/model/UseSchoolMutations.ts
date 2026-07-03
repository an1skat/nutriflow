"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createSchool,
  deleteSchool,
  updateSchool,
} from "@/entities/school/api/SchoolApi";
import { schoolQueryKeys } from "@/entities/school/api/SchoolQueries";
import type {
  DeleteSchoolPayload,
  UpdateSchoolPayload,
} from "@/entities/school/model/School";
import { schoolUserQueryKeys } from "@/entities/school-user/api/SchoolUserQueries";

import type { SchoolFormValues } from "./SchoolFormSchema";

export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: SchoolFormValues) => createSchool(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolQueryKeys.lists(),
      });
    },
  });
}

export function useUpdateSchool(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateSchoolPayload) =>
      updateSchool(schoolId, payload),
    onSuccess: async (school) => {
      queryClient.setQueryData(
        schoolQueryKeys.detail(schoolId),
        school,
      );
      await queryClient.invalidateQueries({
        queryKey: schoolQueryKeys.lists(),
      });
    },
  });
}

export function useDeleteSchool(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload?: DeleteSchoolPayload) =>
      deleteSchool(schoolId, payload),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: schoolQueryKeys.scope(schoolId),
      });
      queryClient.removeQueries({
        queryKey: schoolUserQueryKeys.school(schoolId),
      });
      await queryClient.invalidateQueries({
        queryKey: schoolQueryKeys.lists(),
      });
    },
  });
}
