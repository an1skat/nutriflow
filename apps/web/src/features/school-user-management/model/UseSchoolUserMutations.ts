'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createSchoolUser,
  deleteSchoolUser,
  resetSchoolUserPassword,
  updateSchoolUser,
} from '@/entities/school-user/api/SchoolUserApi';
import { schoolUserQueryKeys } from '@/entities/school-user/api/SchoolUserQueries';

import type { CreateSchoolUserFormValues, EditSchoolUserFormValues } from './SchoolUserFormSchemas';

export function useCreateSchoolUser(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateSchoolUserFormValues) =>
      createSchoolUser(schoolId, {
        username: values.username,
        email: values.email || null,
        password: values.password,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: schoolUserQueryKeys.lists(schoolId),
      });
    },
  });
}

export function useUpdateSchoolUser(schoolId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: EditSchoolUserFormValues) =>
      updateSchoolUser(schoolId, userId, {
        username: values.username,
        email: values.email || null,
        is_active: values.is_active,
      }),
    onSuccess: async (user) => {
      queryClient.setQueryData(schoolUserQueryKeys.detail(schoolId, userId), user);
      await queryClient.invalidateQueries({
        queryKey: schoolUserQueryKeys.lists(schoolId),
      });
    },
  });
}

export function useDeleteSchoolUser(schoolId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteSchoolUser(schoolId, userId),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: schoolUserQueryKeys.detail(schoolId, userId),
      });
      await queryClient.invalidateQueries({
        queryKey: schoolUserQueryKeys.lists(schoolId),
      });
    },
  });
}

export function useResetSchoolUserPassword(schoolId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => resetSchoolUserPassword(schoolId, userId, password),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: schoolUserQueryKeys.detail(schoolId, userId),
        }),
        queryClient.invalidateQueries({
          queryKey: schoolUserQueryKeys.lists(schoolId),
        }),
      ]);
    },
  });
}
