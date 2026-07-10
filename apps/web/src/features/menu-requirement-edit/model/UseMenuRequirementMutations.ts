"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteMenuRequirement,
  updateMenuRequirement,
} from "@/entities/menu-requirement/api/MenuRequirementApi";
import { menuRequirementQueryKeys } from "@/entities/menu-requirement/api/MenuRequirementQueries";
import type { UpdateMenuRequirementPayload } from "@/entities/menu-requirement/model/MenuRequirement";

export function useUpdateMenuRequirement(requirementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateMenuRequirementPayload) =>
      updateMenuRequirement(requirementId, payload),
    onSuccess: async (requirement) => {
      queryClient.setQueryData(
        menuRequirementQueryKeys.detail(requirement.id),
        requirement,
      );
      await Promise.all([
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

export function useDeleteMenuRequirement(requirementId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteMenuRequirement(requirementId),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: menuRequirementQueryKeys.detail(requirementId),
      });
      await Promise.all([
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
