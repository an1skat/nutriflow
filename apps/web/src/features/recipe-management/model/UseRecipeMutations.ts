"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  confirmDishCardVersion,
  createAllergen,
  createDishCardVersion,
  createIngredient,
  updateAllergen,
  updateDishCard,
  updateDishCardVersion,
  updateIngredient,
} from "@/entities/recipe/api/RecipeApi";
import { recipeQueryKeys } from "@/entities/recipe/api/RecipeQueries";
import type {
  CreateAllergenPayload,
  CreateDishCardVersionPayload,
  CreateIngredientPayload,
  UpdateAllergenPayload,
  UpdateDishCardPayload,
  UpdateDishCardVersionPayload,
  UpdateIngredientPayload,
} from "@/entities/recipe/model/Recipe";

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateIngredientPayload) => createIngredient(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateIngredientPayload;
    }) => updateIngredient(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    },
  });
}

export function useCreateAllergen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAllergenPayload) => createAllergen(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    },
  });
}

export function useUpdateAllergen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateAllergenPayload;
    }) => updateAllergen(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    },
  });
}

export function useUpdateDishCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateDishCardPayload;
    }) => updateDishCard(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeQueryKeys.all });
    },
  });
}

export function useUpdateDishCardVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateDishCardVersionPayload;
    }) => updateDishCardVersion(id, payload),
    onSuccess: async (version) => {
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.versions(version.dish_card_id),
      });
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.version(version.id),
      });
    },
  });
}

export function useConfirmDishCardVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => confirmDishCardVersion(versionId),
    onSuccess: async (version) => {
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.versions(version.dish_card_id),
      });
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.dishCard(version.dish_card_id),
      });
    },
  });
}

export function useCreateDishCardVersion(dishCardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDishCardVersionPayload) =>
      createDishCardVersion(dishCardId, payload),
    onSuccess: async (version) => {
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.versions(dishCardId),
      });
      queryClient.invalidateQueries({
        queryKey: recipeQueryKeys.version(version.id),
      });
    },
  });
}
