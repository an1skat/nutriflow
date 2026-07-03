import { LoginForm } from "@/features/auth/ui/LoginForm";
import { getSafeReturnPath } from "@/shared/lib/SafeReturnPath";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const returnTo = getSafeReturnPath(rawNext);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--nf-canvas)] p-5">
      <section className="w-full max-w-[420px] border border-[var(--nf-line-strong)] bg-white shadow-[0_2px_8px_rgb(0_0_0/12%)]">
        <div className="border-b border-[var(--nf-brand-dark)] bg-[var(--nf-brand)] px-5 py-4 text-white">
          <p className="text-base font-bold tracking-wide">NutriFlow</p>
          <p className="mt-1 text-xs text-white/80">
            Система керування шкільним харчуванням
          </p>
        </div>
        <div className="p-5">
          <h1 className="text-lg font-bold text-slate-900">Вхід до системи</h1>
          <p className="mb-5 mt-1 text-xs leading-5 text-slate-600">
            Використовуйте облікові дані, надані адміністратором.
          </p>

          <LoginForm returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
