import {
  apiClient,
  getCsrfHeaders,
  isHttpStatus,
} from "@/shared/api/HttpClient";

import {
  authUserSchema,
  type AuthUser,
  type LoginInput,
} from "../model/Session";

export async function loginSession(input: LoginInput): Promise<void> {
  await apiClient.post("/auth/login", input);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await apiClient.get<unknown>("/auth/me");
    return authUserSchema.parse(response.data);
  } catch (error) {
    if (isHttpStatus(error, 401)) {
      return null;
    }

    throw error;
  }
}

export async function logoutSession(): Promise<void> {
  await apiClient.post("/auth/logout", undefined, {
    headers: getCsrfHeaders(),
  });
}
