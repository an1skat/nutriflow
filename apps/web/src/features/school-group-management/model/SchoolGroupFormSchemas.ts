import { z } from 'zod';

import { ageGroupSchema } from '@/entities/school-group/model/SchoolGroup';

export const schoolGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Введіть назву групи')
    .max(200, 'Назва має містити не більше 200 символів'),
  age_group: ageGroupSchema,
});

export const editSchoolGroupFormSchema = schoolGroupFormSchema
  .omit({
    age_group: true,
  })
  .extend({
    is_active: z.boolean(),
  });

export type SchoolGroupFormValues = z.infer<typeof schoolGroupFormSchema>;
export type EditSchoolGroupFormValues = z.infer<typeof editSchoolGroupFormSchema>;
