"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveSchoolWeeklyMenu,
  archiveWeeklyMenu,
  closeWeeklyMenuDay,
  createWeeklyMenu,
  devReopenWeeklyMenuDay,
  deleteWeeklyMenu,
  publishWeeklyMenu,
  restoreSchoolWeeklyMenu,
  revokeWeeklyMenu,
  restoreWeeklyMenu,
  updateWeeklyMenu,
} from "@/entities/weekly-menu/api/WeeklyMenuApi";
import { weeklyMenuQueryKeys } from "@/entities/weekly-menu/api/WeeklyMenuQueries";
import { menuRequirementQueryKeys } from "@/entities/menu-requirement/api/MenuRequirementQueries";
import type {
  PublishWeeklyMenuPayload,
  Weekday,
  WeeklyMenuPayload,
  WeeklyMenuUpdatePayload,
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
    mutationFn: (payload: WeeklyMenuUpdatePayload) =>
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

export function useDeleteWeeklyMenus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuIds: string[]) =>
      Promise.all(menuIds.map((menuId) => deleteWeeklyMenu(menuId))),
    onSuccess: async (_result, menuIds) => {
      for (const menuId of menuIds) {
        queryClient.removeQueries({
          queryKey: weeklyMenuQueryKeys.detail(menuId),
        });
      }
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

export function useCloseWeeklyMenuDay(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekday: Weekday) => closeWeeklyMenuDay(menuId, weekday),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: weeklyMenuQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.calendars(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.reports(),
        }),
      ]);
    },
  });
}

export function useDevReopenWeeklyMenuDay(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekday: Weekday) => devReopenWeeklyMenuDay(menuId, weekday),
    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menuId), menu);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: weeklyMenuQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.calendars(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.reports(),
        }),
      ]);
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

export function useRestoreWeeklyMenus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuIds: string[]) =>
      Promise.all(menuIds.map((menuId) => restoreWeeklyMenu(menuId))),
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
