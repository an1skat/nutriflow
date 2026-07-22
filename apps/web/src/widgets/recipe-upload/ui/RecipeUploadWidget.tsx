import { DishCardUploadForm } from '@/features/recipe-upload/ui/DishCardUploadForm';

export function RecipeUploadWidget() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Завантаження техкарти</h1>
        <p className="mt-1 text-sm text-slate-600">
          Внесіть техкарту вручну: основне, порції та інгредієнти з брутто/нетто на порцію. Після
          збереження техкарта проходить перевірку та підтверджується.
        </p>
      </div>
      <DishCardUploadForm />
    </main>
  );
}
