import { z } from 'zod';

import { schoolCommunitySchema } from '@/entities/school/model/School';

export const schoolFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Введіть назву школи')
    .max(200, 'Назва має містити не більше 200 символів'),
  community: z.union([schoolCommunitySchema, z.literal('')]),
});

export const editSchoolFormSchema = schoolFormSchema.extend({
  is_active: z.boolean(),
});

export type SchoolFormValues = z.infer<typeof schoolFormSchema>;
export type EditSchoolFormValues = z.infer<typeof editSchoolFormSchema>;
