"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { useCurrentUser, useLogin } from "@/features/auth/hooks";
import { loginSchema, type LoginInput } from "@/features/auth/model";
import { getApiErrorMessage, isHttpStatus } from "@/lib/api-client";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const login = useLogin();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  useEffect(() => {
    if (currentUser.data) {
      router.replace(returnTo);
    }
  }, [currentUser.data, returnTo, router]);

  if (currentUser.isPending || currentUser.data) {
    return (
      <p role="status" className="text-sm text-zinc-600">
        Перевіряємо поточну сесію…
      </p>
    );
  }

  if (currentUser.isError) {
    return (
      <div>
        <p role="alert" className="text-sm text-red-700">
          {getApiErrorMessage(currentUser.error)}
        </p>
        <button
          type="button"
          onClick={() => void currentUser.refetch()}
          disabled={currentUser.isFetching}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Повторити перевірку
        </button>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting || login.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");

    try {
      await login.mutateAsync(values);
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      form.setError("root", {
        type: "server",
        message: isHttpStatus(error, 401)
          ? "Неправильний логін або пароль."
          : getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <label
          htmlFor="identifier"
          className="mb-1.5 block text-sm font-medium"
        >
          Логін або email
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          aria-invalid={
            form.formState.errors.identifier ? "true" : "false"
          }
          {...form.register("identifier")}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-900"
        />
        {form.formState.errors.identifier ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {form.formState.errors.identifier.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium"
        >
          Пароль
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={form.formState.errors.password ? "true" : "false"}
          {...form.register("password")}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-900"
        />
        {form.formState.errors.password ? (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="text-sm text-red-700">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Входимо…" : "Увійти"}
      </button>
    </form>
  );
}
