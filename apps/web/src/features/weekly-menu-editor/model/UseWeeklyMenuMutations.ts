"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveSchoolWeeklyMenu,
  archiveWeeklyMenu,
  createWeeklyMenu,
  deleteWeeklyMenu,
  publishWeeklyMenu,
  restoreSchoolWeeklyMenu,
  revokeWeeklyMenu,
  restoreWeeklyMenu,
  updateWeeklyMenu,
} from "@/entities/weekly-menu/api/WeeklyMenuApi";
import { weeklyMenuQueryKeys } from "@/entities/weekly-menu/api/WeeklyMenuQueries";
import type {
  PublishWeeklyMenuPayload,
  WeeklyMenuPayload,
} from "@/entities/weekly-menu/model/WeeklyMenu";

export function useCreateWeeklyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WeeklyMenuPayload) => createWeeklyMenu(payload),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menu.id), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useUpdateWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WeeklyMenuPayload) =>
      updateWeeklyMenu(menuId, payload),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useDeleteWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteWeeklyMenu(menuId),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: weeklyMenuQueryKeys.detail(menuId),
      });
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useArchiveWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => archiveWeeklyMenu(menuId),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useArchiveSchoolWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => archiveSchoolWeeklyMenu(menuId),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useRestoreSchoolWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => restoreSchoolWeeklyMenu(menuId),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useRevokeWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => revokeWeeklyMenu(menuId),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useRevokeWeeklyMenus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuIds: string[]) =>
      Promise.all(menuIds.map((menuId) => revokeWeeklyMenu(menuId))),
    onSuccess: async (menus) => {
      for (const menu of menus) {
        queryClient.setQueryData(weeklyMenuQueryKeys.detail(menu.id), menu);
      }
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useRestoreWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => restoreWeeklyMenu(menuId),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function usePublishWeeklyMenu(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PublishWeeklyMenuPayload) =>
      publishWeeklyMenu(menuId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.all,
      });
    },
  });
}
