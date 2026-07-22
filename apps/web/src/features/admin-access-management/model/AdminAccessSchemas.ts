import { z } from 'zod';

import { type AdminPermission, adminPermissionSchema } from '@/entities/session/model/Session';

export const adminPermissionOptions: Array<{
  value: AdminPermission;
  label: string;
  description: string;
}> = [
  {
    value: 'schools.manage',
    label: 'Школи',
    description: 'Створення та редагування власних шкіл.',
  },
  {
    value: 'school_users.manage',
    label: 'Менеджери шкіл',
    description: 'Облікові записи шкіл у межах власних шкіл.',
  },
  {
    value: 'school_groups.manage',
    label: 'Групи',
    description: 'Вікові групи у власних школах.',
  },
  {
    value: 'menus.manage',
    label: 'Меню',
    description: 'Створення і публікація меню для власних шкіл.',
  },
  {
    value: 'recipes.view',
    label: 'Перегляд техкарт',
    description: 'Перегляд техкарт, інгредієнтів та алергенів без редагування.',
  },
  {
    value: 'recipes.manage',
    label: 'Керування техкартами',
    description: 'Створення та редагування довідника техкарт.',
  },
];

export const defaultLowerAdminPermissions: AdminPermission[] = [
  'schools.manage',
  'school_users.manage',
  'school_groups.manage',
  'menus.manage',
];

export const createAdminUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Введіть щонайменше 3 символи')
      .max(50, 'Логін надто довгий')
      .regex(
        /^[a-z0-9][a-z0-9._-]*$/,
        'Лише малі латинські літери, цифри, крапка, дефіс або підкреслення'
      ),
    email: z.string().trim().email('Введіть коректний email').max(320, 'Email надто довгий'),
    password: z
      .string()
      .min(12, 'Пароль має містити щонайменше 12 символів')
      .max(128, 'Пароль надто довгий'),
    role: z.enum(['ADMIN', 'TECHNOLOGIST']),
    permissions: z.array(adminPermissionSchema),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'ADMIN' && value.permissions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Оберіть хоча б одне право',
        path: ['permissions'],
      });
    }
  });

export type CreateAdminUserFormValues = z.infer<typeof createAdminUserSchema>;
