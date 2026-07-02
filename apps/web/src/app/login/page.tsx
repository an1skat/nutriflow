import { LoginForm } from "@/components/auth/login-form";
import { getSafeReturnPath } from "@/lib/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">NutriFlow</p>
        <h1 className="mt-2 text-2xl font-semibold">Вхід до системи</h1>
        <p className="mb-7 mt-2 text-sm text-zinc-600">
          Використовуйте облікові дані, надані адміністратором.
        </p>

        <LoginForm returnTo={returnTo} />
      </section>
    </main>
  );
}
