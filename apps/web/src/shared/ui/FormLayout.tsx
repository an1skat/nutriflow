import type { ReactNode } from "react";

export function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="nf-panel">
      <div className="nf-panel-header flex items-center justify-between">
        <h2 className="nf-panel-title">{title}</h2>
        {action}
      </div>
      <div className="nf-panel-body flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="nf-label">{label}</span>
      {children}
      {error ? <p role="alert" className="nf-field-error">{error}</p> : null}
    </div>
  );
}
