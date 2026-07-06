"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createAdminUser,
  deleteAdminUser,
  resetAdminUserPassword,
  updateAdminUser,
} from "@/entities/admin-user/api/AdminUserApi";
import { adminUserQueryKeys } from "@/entities/admin-user/api/AdminUserQueries";
import type { UpdateAdminUserPayload } from "@/entities/admin-user/model/AdminUser";

import type { CreateAdminUserFormValues } from "./AdminAccessSchemas";

export function useCreateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateAdminUserFormValues) =>
      createAdminUser({
        ...values,
        username: values.username.trim().toLowerCase(),
        email: values.email.trim().toLowerCase(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminUserQueryKeys.lists(),
      });
    },
  });
}

export function useUpdateAdminUser(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateAdminUserPayload) =>
      updateAdminUser(userId, payload),
    onSuccess: async (user) => {
      queryClient.setQueryData(adminUserQueryKeys.detail(userId), user);
      await queryClient.invalidateQueries({
        queryKey: adminUserQueryKeys.lists(),
      });
    },
  });
}

export function useDeleteAdminUser(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAdminUser(userId),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: adminUserQueryKeys.detail(userId),
      });
      await queryClient.invalidateQueries({
        queryKey: adminUserQueryKeys.lists(),
      });
    },
  });
}

export function useResetAdminUserPassword(userId: string) {
  return useMutation({
    mutationFn: (password: string) =>
      resetAdminUserPassword(userId, password),
  });
}
