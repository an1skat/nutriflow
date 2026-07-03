"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  loginSchema,
  type LoginInput,
} from "@/entities/session/model/Session";
import { useCurrentUser } from "@/entities/session/api/SessionQueries";
import {
  useLogin,
} from "@/features/auth/model/UseSession";
import { getPostLoginPath } from "@/features/access/model/AccessPolicy";
import {
  getApiErrorMessage,
  isHttpStatus,
} from "@/shared/api/HttpClient";

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
      const destination = getPostLoginPath(currentUser.data, returnTo);

      if (destination.denied) {
        toast.error("Цей розділ недоступний для вашої ролі.", {
          id: "login-access-denied",
        });
      }

      router.replace(destination.path);
    }
  }, [currentUser.data, returnTo, router]);

  if (currentUser.isPending || currentUser.data) {
    return (
      <p role="status" className="text-sm text-slate-600">
        Перевіряємо поточну сесію…
      </p>
    );
  }

  if (currentUser.isError) {
    return (
      <div>
        <p role="alert" className="nf-error">
          {getApiErrorMessage(currentUser.error)}
        </p>
        <button
          type="button"
          onClick={() => void currentUser.refetch()}
          disabled={currentUser.isFetching}
          className="nf-button nf-button-primary mt-4"
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
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label
          htmlFor="identifier"
          className="nf-label"
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
          className="nf-input"
        />
        {form.formState.errors.identifier ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.identifier.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="password"
          className="nf-label"
        >
          Пароль
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={form.formState.errors.password ? "true" : "false"}
          {...form.register("password")}
          className="nf-input"
        />
        {form.formState.errors.password ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="nf-button nf-button-primary w-full"
      >
        {submitting ? "Входимо…" : "Увійти"}
      </button>
    </form>
  );
}
