"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { generateMenuRequirements } from "@/entities/menu-requirement/api/MenuRequirementApi";
import { menuRequirementQueryKeys } from "@/entities/menu-requirement/api/MenuRequirementQueries";
import type { GenerateMenuRequirementsPayload } from "@/entities/menu-requirement/model/MenuRequirement";

export function useGenerateMenuRequirements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GenerateMenuRequirementsPayload) =>
      generateMenuRequirements(payload),
    onSuccess: async (response) => {
      for (const requirement of response.items) {
        queryClient.setQueryData(
          menuRequirementQueryKeys.detail(requirement.id),
          requirement,
        );
      }
      await queryClient.invalidateQueries({
        queryKey: menuRequirementQueryKeys.lists(),
      });
    },
  });
}
