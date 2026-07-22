import { z } from 'zod';

export const schoolFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Введіть назву школи')
    .max(200, 'Назва має містити не більше 200 символів'),
  code: z
    .string()
    .trim()
    .min(2, 'Код має містити щонайменше 2 символи')
    .max(50, 'Код має містити не більше 50 символів'),
});

export const editSchoolFormSchema = schoolFormSchema.extend({
  is_active: z.boolean(),
});

export const deleteSchoolFormSchema = z.object({
  password: z
    .string()
    .min(1, 'Введіть пароль адміністратора')
    .max(128, 'Пароль має містити не більше 128 символів')
    .refine((value) => value.trim().length > 0, {
      message: 'Введіть пароль адміністратора',
    }),
});

export type SchoolFormValues = z.infer<typeof schoolFormSchema>;
export type EditSchoolFormValues = z.infer<typeof editSchoolFormSchema>;
export type DeleteSchoolFormValues = z.infer<typeof deleteSchoolFormSchema>;
