import { z } from 'zod'

import {
	ageGroupSchema,
	mealTypeSchema,
	menuItemKindSchema,
	weekdaySchema,
	weeklyMenuSchema,
	type AgeGroup
} from '@/entities/weekly-menu/model/WeeklyMenu'

const nullableIdSchema = z.string().min(1).nullable()
const nullableTextSchema = z.string().nullable()
const decimalValueSchema = z
	.union([z.string(), z.number()])
	.transform(value => String(value))
	.nullable()

export const weeklyMenuImportDiagnosticSchema = z.object({
	level: z.enum(['warning', 'error']),
	message: z.string().min(1),
	code: z.string().min(1),
	sheet_name: nullableTextSchema,
	row_number: z.number().int().positive().nullable(),
	column_letter: nullableTextSchema,
	cell: nullableTextSchema
})

export const weeklyMenuImportPortionSchema = z.object({
	age_group: ageGroupSchema,
	yield_amount: z.string(),
	dish_card_portion_variant_id: nullableIdSchema,
	nutrition: z.object({
		kcal: decimalValueSchema,
		proteins: decimalValueSchema,
		fats: decimalValueSchema,
		carbs: decimalValueSchema
	})
})

export const weeklyMenuImportItemSchema = z.object({
	id: z.string().min(1).nullable().optional(),
	position: z.number().int().positive(),
	kind: menuItemKindSchema,
	source_text: nullableTextSchema,
	recipe_card_number: nullableTextSchema,
	dish_card_id: nullableIdSchema,
	dish_card_version_id: nullableIdSchema,
	product_ingredient_id: nullableIdSchema,
	product_name_snapshot: nullableTextSchema,
	name: z.string().min(1),
	allergen_codes: z.array(z.string()),
	portions: z.array(weeklyMenuImportPortionSchema).min(1),
	servings: z
		.array(
			z.object({
				school_group_id: z.string().min(1),
				age_group: ageGroupSchema,
				children_count: z.number().int().nonnegative()
			})
		)
		.default([]),
	notes: nullableTextSchema
})

export const weeklyMenuImportDaySchema = z.object({
	weekday: weekdaySchema,
	date: nullableTextSchema,
	items: z.array(weeklyMenuImportItemSchema).min(1),
	notes: nullableTextSchema
})

export const weeklyMenuImportMenuSchema = z.object({
	title: z.string().min(1),
	school_id: nullableIdSchema,
	meal_type: mealTypeSchema,
	cycle_week: z.number().int().positive().nullable(),
	starts_on: nullableTextSchema,
	ends_on: nullableTextSchema,
	days: z.array(weeklyMenuImportDaySchema).min(1),
	notes: nullableTextSchema,
	source_file_name: nullableTextSchema,
	source_sheet_name: nullableTextSchema
})

export const weeklyMenuImportPreviewSchema = z.object({
	preview_id: z.string().min(1),
	filename: z.string().min(1),
	available_sheet_names: z.array(z.string()),
	selected_sheet_name: nullableTextSchema,
	parsed_sheet_names: z.array(z.string()),
	diagnostics: z.array(weeklyMenuImportDiagnosticSchema),
	commit_ready: z.boolean(),
	expires_at: z.string().min(1),
	menu: weeklyMenuImportMenuSchema.nullable(),
	menus: z.array(
		z.object({
			sheet_name: z.string().min(1),
			menu: weeklyMenuImportMenuSchema
		})
	)
})

export const weeklyMenuImportCommitSchema = z.object({
	preview_id: z.string().min(1),
	school_id: nullableIdSchema,
	created_menu_ids: z.array(z.string().min(1)),
	menu: weeklyMenuSchema.nullable(),
	menus: z.array(weeklyMenuSchema)
})

export type WeeklyMenuImportDiagnostic = z.infer<
	typeof weeklyMenuImportDiagnosticSchema
>
export type WeeklyMenuImportPortion = z.infer<
	typeof weeklyMenuImportPortionSchema
>
export type WeeklyMenuImportItem = z.infer<typeof weeklyMenuImportItemSchema>
export type WeeklyMenuImportDay = z.infer<typeof weeklyMenuImportDaySchema>
export type WeeklyMenuImportMenu = z.infer<typeof weeklyMenuImportMenuSchema>
export type WeeklyMenuImportPreview = z.infer<
	typeof weeklyMenuImportPreviewSchema
>
export type WeeklyMenuImportCommit = z.infer<
	typeof weeklyMenuImportCommitSchema
>

export const WEEKLY_MENU_XLSX_MAX_BYTES = 2 * 1024 * 1024
export const XLSX_MIME_TYPE =
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const PREVIEW_AGE_GROUPS: AgeGroup[] = ['6-11', '11-14', '14-18']

export function isXlsxFile(file: File): boolean {
	const hasXlsxName = file.name.toLocaleLowerCase().endsWith('.xlsx')
	const hasAcceptedMime =
		file.type === '' ||
		file.type === XLSX_MIME_TYPE ||
		file.type === 'application/octet-stream'

	return hasXlsxName && hasAcceptedMime
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} Б`
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} КБ`
	}

	return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function getImportPreviewSummary(preview: WeeklyMenuImportPreview) {
	return preview.menus.reduce(
		(summary, entry) => {
			summary.menus += 1
			summary.days += entry.menu.days.length
			summary.items += entry.menu.days.reduce(
				(count, day) => count + day.items.length,
				0
			)
			return summary
		},
		{ menus: 0, days: 0, items: 0 }
	)
}

export function getPortionForAgeGroup(
	item: WeeklyMenuImportItem,
	ageGroup: AgeGroup
): WeeklyMenuImportPortion | undefined {
	return item.portions.find(portion => portion.age_group === ageGroup)
}
