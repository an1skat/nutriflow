"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import {
  fetchAllergens,
  fetchDishCard,
  fetchDishCardVersion,
  fetchDishCardVersions,
  fetchDishCards,
  fetchIngredients,
} from "./RecipeApi";

export const recipeQueryKeys = {
  all: ["recipe"] as const,
  allergens: (query: string) => [...recipeQueryKeys.all, "allergens", query] as const,
  ingredients: (query: string) =>
    [...recipeQueryKeys.all, "ingredients", query] as const,
  dishCards: (query: string) => [...recipeQueryKeys.all, "dishCards", query] as const,
  dishCard: (id: string) => [...recipeQueryKeys.all, "dishCard", id] as const,
  versions: (dishCardId: string) =>
    [...recipeQueryKeys.all, "versions", dishCardId] as const,
  version: (versionId: string) =>
    [...recipeQueryKeys.all, "version", versionId] as const,
};

export function allergensQueryOptions(query: string) {
  return queryOptions({
    queryKey: recipeQueryKeys.allergens(query),
    queryFn: () => fetchAllergens(query),
    staleTime: 60_000,
  });
}

export function ingredientsQueryOptions(query: string, enabled = true) {
  return queryOptions({
    queryKey: recipeQueryKeys.ingredients(query),
    queryFn: () => fetchIngredients(query),
    enabled,
    staleTime: 60_000,
  });
}

export function dishCardsQueryOptions(query: string, enabled = true) {
  return queryOptions({
    queryKey: recipeQueryKeys.dishCards(query),
    queryFn: () => fetchDishCards(query),
    enabled,
    staleTime: 60_000,
  });
}

export function dishCardQueryOptions(dishCardId: string) {
  return queryOptions({
    queryKey: recipeQueryKeys.dishCard(dishCardId),
    queryFn: () => fetchDishCard(dishCardId),
    enabled: dishCardId.length > 0,
  });
}

export function dishCardVersionsQueryOptions(dishCardId: string) {
  return queryOptions({
    queryKey: recipeQueryKeys.versions(dishCardId),
    queryFn: () => fetchDishCardVersions(dishCardId),
    enabled: dishCardId.length > 0,
  });
}

export function dishCardVersionQueryOptions(versionId: string) {
  return queryOptions({
    queryKey: recipeQueryKeys.version(versionId),
    queryFn: () => fetchDishCardVersion(versionId),
    enabled: versionId.length > 0,
  });
}

export function useAllergens(query: string) {
  return useQuery(allergensQueryOptions(query));
}

export function useIngredients(query: string, enabled = true) {
  return useQuery(ingredientsQueryOptions(query, enabled));
}

export function useDishCards(query: string, enabled = true) {
  return useQuery(dishCardsQueryOptions(query, enabled));
}

export function useDishCard(dishCardId: string) {
  return useQuery(dishCardQueryOptions(dishCardId));
}

export function useDishCardVersions(dishCardId: string) {
  return useQuery(dishCardVersionsQueryOptions(dishCardId));
}

export function useDishCardVersion(versionId: string) {
  return useQuery(dishCardVersionQueryOptions(versionId));
}
