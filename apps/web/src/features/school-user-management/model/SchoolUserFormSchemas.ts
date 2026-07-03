import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Логін має містити щонайменше 3 символи")
  .max(50, "Логін має містити не більше 50 символів")
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Використовуйте латинські малі літери, цифри, крапку, дефіс або підкреслення",
  );

const optionalEmailSchema = z.union([
  z.string().trim().email("Введіть коректну email-адресу"),
  z.literal(""),
]);

const passwordSchema = z
  .string()
  .min(12, "Пароль має містити щонайменше 12 символів")
  .max(128, "Пароль має містити не більше 128 символів")
  .refine((value) => value.trim().length > 0, "Пароль не може бути порожнім");

export const createSchoolUserFormSchema = z.object({
  username: usernameSchema,
  email: optionalEmailSchema,
  password: passwordSchema,
});

export const editSchoolUserFormSchema = z.object({
  username: usernameSchema,
  email: optionalEmailSchema,
  is_active: z.boolean(),
});

export const resetSchoolUserPasswordFormSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Паролі не збігаються",
    path: ["passwordConfirmation"],
  });

export type CreateSchoolUserFormValues = z.infer<
  typeof createSchoolUserFormSchema
>;
export type EditSchoolUserFormValues = z.infer<
  typeof editSchoolUserFormSchema
>;
export type ResetSchoolUserPasswordFormValues = z.infer<
  typeof resetSchoolUserPasswordFormSchema
>;
