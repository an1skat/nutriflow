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

export type SchoolFormValues = z.infer<typeof schoolFormSchema>;
export type EditSchoolFormValues = z.infer<typeof editSchoolFormSchema>;
