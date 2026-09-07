import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';

import {
  type Allergen,
  type AllergenList,
  type CreateAllergenPayload,
  type CreateDishCardPayload,
  type CreateDishCardVersionPayload,
  type CreateIngredientPayload,
  type DishCard,
  type DishCardList,
  type DishCardVersion,
  type DishCardVersionList,
  type Ingredient,
  type IngredientList,
  type UpdateAllergenPayload,
  type UpdateDishCardPayload,
  type UpdateDishCardVersionPayload,
  type UpdateIngredientPayload,
  type ValidationResponse,
  allergenListSchema,
  allergenSchema,
  dishCardListSchema,
  dishCardSchema,
  dishCardVersionListSchema,
  dishCardVersionSchema,
  ingredientListSchema,
  ingredientSchema,
  validationResponseSchema,
} from '../model/Recipe';

export async function fetchAllergens(query?: string): Promise<AllergenList> {
  const response = await apiClient.get<unknown>('/recipes/allergens', {
    params: { limit: 100, query: query || undefined },
  });
  return allergenListSchema.parse(response.data);
}

export async function fetchIngredients(query?: string): Promise<IngredientList> {
  const response = await apiClient.get<unknown>('/recipes/ingredients', {
    params: { limit: 100, query: query || undefined },
  });
  return ingredientListSchema.parse(response.data);
}

export async function fetchDishCards(query?: string): Promise<DishCardList> {
  const response = await apiClient.get<unknown>('/recipes/dish-cards', {
    params: { limit: 100, query: query || undefined },
  });
  return dishCardListSchema.parse(response.data);
}

export async function fetchDishCard(dishCardId: string): Promise<DishCard> {
  const response = await apiClient.get<unknown>(`/recipes/dish-cards/${dishCardId}`);
  return dishCardSchema.parse(response.data);
}

export async function fetchDishCardVersions(dishCardId: string): Promise<DishCardVersionList> {
  const response = await apiClient.get<unknown>(`/recipes/dish-cards/${dishCardId}/versions`);
  return dishCardVersionListSchema.parse(response.data);
}

export async function fetchDishCardVersion(versionId: string): Promise<DishCardVersion> {
  const response = await apiClient.get<unknown>(`/recipes/dish-card-versions/${versionId}`);
  return dishCardVersionSchema.parse(response.data);
}

export async function createAllergen(payload: CreateAllergenPayload): Promise<Allergen> {
  const response = await apiClient.post<unknown>('/recipes/allergens', payload, {
    headers: getCsrfHeaders(),
  });
  return allergenSchema.parse(response.data);
}

export async function createIngredient(payload: CreateIngredientPayload): Promise<Ingredient> {
  const response = await apiClient.post<unknown>('/recipes/ingredients', payload, {
    headers: getCsrfHeaders(),
  });
  return ingredientSchema.parse(response.data);
}

export async function createDishCard(payload: CreateDishCardPayload): Promise<DishCard> {
  const response = await apiClient.post<unknown>('/recipes/dish-cards', payload, {
    headers: getCsrfHeaders(),
  });
  return dishCardSchema.parse(response.data);
}

export async function createDishCardVersion(
  dishCardId: string,
  payload: CreateDishCardVersionPayload
): Promise<DishCardVersion> {
  const response = await apiClient.post<unknown>(
    `/recipes/dish-cards/${dishCardId}/versions`,
    payload,
    { headers: getCsrfHeaders() }
  );
  return dishCardVersionSchema.parse(response.data);
}

export async function updateIngredient(
  ingredientId: string,
  payload: UpdateIngredientPayload
): Promise<Ingredient> {
  const response = await apiClient.patch<unknown>(`/recipes/ingredients/${ingredientId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return ingredientSchema.parse(response.data);
}

export async function updateAllergen(
  allergenId: string,
  payload: UpdateAllergenPayload
): Promise<Allergen> {
  const response = await apiClient.patch<unknown>(`/recipes/allergens/${allergenId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return allergenSchema.parse(response.data);
}

export async function updateDishCard(
  dishCardId: string,
  payload: UpdateDishCardPayload
): Promise<DishCard> {
  const response = await apiClient.patch<unknown>(`/recipes/dish-cards/${dishCardId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return dishCardSchema.parse(response.data);
}

export async function updateDishCardVersion(
  versionId: string,
  payload: UpdateDishCardVersionPayload
): Promise<DishCardVersion> {
  const response = await apiClient.patch<unknown>(
    `/recipes/dish-card-versions/${versionId}`,
    payload,
    { headers: getCsrfHeaders() }
  );
  return dishCardVersionSchema.parse(response.data);
}

export async function validateDishCardVersion(versionId: string): Promise<ValidationResponse> {
  const response = await apiClient.get<unknown>(
    `/recipes/dish-card-versions/${versionId}/validation`
  );
  return validationResponseSchema.parse(response.data);
}

export async function confirmDishCardVersion(versionId: string): Promise<DishCardVersion> {
  const response = await apiClient.post<unknown>(
    `/recipes/dish-card-versions/${versionId}/confirm`,
    undefined,
    { headers: getCsrfHeaders() }
  );
  return dishCardVersionSchema.parse(response.data);
}

export async function setMainDishCardVersion(versionId: string): Promise<DishCard> {
  const response = await apiClient.put<unknown>(
    `/recipes/dish-card-versions/${versionId}/main`,
    undefined,
    { headers: getCsrfHeaders() }
  );
  return dishCardSchema.parse(response.data);
}
