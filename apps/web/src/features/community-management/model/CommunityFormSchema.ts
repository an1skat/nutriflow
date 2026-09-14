import { z } from 'zod';

import { communityCodeSchema } from '@/entities/community/model/Community';

export const communityFormSchema = z.object({
  code: communityCodeSchema.regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'Код може містити лише малі латинські літери, цифри та дефіси'
  ),
  name: z
    .string()
    .trim()
    .min(1, 'Введіть назву громади')
    .max(200, 'Назва має містити не більше 200 символів'),
  admin_owner_id: z.string(),
});

export type CommunityFormValues = z.infer<typeof communityFormSchema>;
