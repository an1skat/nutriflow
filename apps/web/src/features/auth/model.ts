import { z } from "zod";

const baseUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().nullable(),
  is_active: z.boolean(),
});

export const authUserSchema = z.discriminatedUnion("role", [
  baseUserSchema.extend({
    role: z.literal("ADMIN"),
    school_id: z.null(),
  }),
  baseUserSchema.extend({
    role: z.literal("SCHOOL_USER"),
    school_id: z.string().min(1),
  }),
]);

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Введіть щонайменше 3 символи")
    .max(320, "Значення надто довге"),
  password: z
    .string()
    .min(1, "Введіть пароль")
    .max(128, "Пароль надто довгий"),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UserRole = AuthUser["role"];
