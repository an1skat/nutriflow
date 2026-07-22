import { z } from 'zod';

const decimalSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'Некоректне числове значення' });
    return z.NEVER;
  }
  return parsed;
});

export const complianceStatusSchema = z.enum([
  'complete',
  'under',
  'over',
  'missing',
  'stale',
  'unmapped',
  'mixed',
]);

export const normativeUnitSchema = z.enum(['g', 'ml', 'item', 'portion']);
export const contributionSourceSchema = z.enum(['portion_variant', 'ingredient', 'product']);

export const complianceBreakdownSchema = z.object({
  requirement_id: z.string().min(1),
  service_date: z.iso.date(),
  menu_item_id: z.string().min(1),
  dish_name: z.string().min(1),
  source_type: contributionSourceSchema,
  source_id: z.string().nullable(),
  source_name: z.string().min(1),
  amount: decimalSchema,
  unit: normativeUnitSchema,
  portion_equivalent: decimalSchema.nullable(),
});

export const unmappedItemSchema = z.object({
  requirement_id: z.string().min(1),
  service_date: z.iso.date(),
  menu_item_id: z.string().min(1),
  item_name: z.string().min(1),
  reason: z.string().min(1),
});

export const complianceRowSchema = z.object({
  normative_group_code: z.string().min(1),
  normative_group_name: z.string().min(1),
  characteristic: z.string(),
  frequency: z.string().min(1),
  source_appendix: z.string().min(1),
  required_portions: decimalSchema,
  actual_portions: decimalSchema,
  required_amount: decimalSchema,
  actual_amount: decimalSchema,
  unit: normativeUnitSchema,
  percent: decimalSchema.nullable(),
  deviation: decimalSchema,
  status: complianceStatusSchema,
  tolerance: z.object({
    minimum_percent: decimalSchema,
    maximum_percent: decimalSchema,
    description: z.string(),
  }),
  breakdown: z.array(complianceBreakdownSchema),
  unmapped_items: z.array(unmappedItemSchema),
});

export const complianceMealSectionSchema = z.object({
  meal_type: z.enum(['breakfast', 'lunch']),
  status: complianceStatusSchema,
  expected_dates: z.array(z.iso.date()),
  missing_dates: z.array(z.iso.date()),
  stale_dates: z.array(z.iso.date()),
  rows: z.array(complianceRowSchema),
  unmapped_items: z.array(unmappedItemSchema),
});

export const complianceGroupSchema = z.object({
  school_group_id: z.string().min(1),
  school_group_name: z.string().min(1),
  age_group: z.enum(['6-11', '11-14', '14-18']),
  status: complianceStatusSchema,
  sections: z.array(complianceMealSectionSchema),
});

export const normComplianceReportSchema = z.object({
  school_id: z.string().min(1),
  school_name: z.string().min(1),
  date_from: z.iso.date(),
  date_to: z.iso.date(),
  status: complianceStatusSchema,
  groups: z.array(complianceGroupSchema),
});

export type ComplianceStatus = z.infer<typeof complianceStatusSchema>;
export type NormativeUnit = z.infer<typeof normativeUnitSchema>;
export type ContributionSource = z.infer<typeof contributionSourceSchema>;
export type ComplianceBreakdown = z.infer<typeof complianceBreakdownSchema>;
export type UnmappedItem = z.infer<typeof unmappedItemSchema>;
export type ComplianceRow = z.infer<typeof complianceRowSchema>;
export type ComplianceMealSection = z.infer<typeof complianceMealSectionSchema>;
export type ComplianceGroup = z.infer<typeof complianceGroupSchema>;
export type NormComplianceReport = z.infer<typeof normComplianceReportSchema>;

export type NormComplianceReportRequest = {
  school_id: string;
  date_from: string;
  date_to: string;
  meal_type?: 'breakfast' | 'lunch';
  school_group_id?: string;
  enabled?: boolean;
};

export const complianceStatusLabels: Record<ComplianceStatus, string> = {
  complete: 'В нормі',
  under: 'Нижче норми',
  over: 'Вище норми',
  missing: 'Немає меню-вимоги',
  stale: 'Застаріло',
  unmapped: 'Не визначено групу продукту',
  mixed: 'Змішаний статус',
};

export const complianceStatusClasses: Record<ComplianceStatus, string> = {
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  under: 'border-rose-200 bg-rose-50 text-rose-800',
  over: 'border-rose-200 bg-rose-50 text-rose-800',
  missing: 'border-amber-200 bg-amber-50 text-amber-900',
  stale: 'border-amber-200 bg-amber-50 text-amber-900',
  unmapped: 'border-amber-200 bg-amber-50 text-amber-900',
  mixed: 'border-amber-200 bg-amber-50 text-amber-900',
};
