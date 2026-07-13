import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { MenuRequirementAggregateStatus } from "@/entities/menu-requirement/model/MenuRequirement";

const statusLabels: Record<MenuRequirementAggregateStatus, string> = {
  complete: "Готово",
  missing: "Пропущено",
  stale: "Застаріло",
  mixed: "Є питання",
};

const statusClasses: Record<MenuRequirementAggregateStatus, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  missing: "border-amber-200 bg-amber-50 text-amber-800",
  stale: "border-rose-200 bg-rose-50 text-rose-800",
  mixed: "border-orange-200 bg-orange-50 text-orange-800",
};

export function StatusBadge({ status }: { status: MenuRequirementAggregateStatus }) {
  const Icon = status === "complete" ? CheckCircle2 : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-bold ${statusClasses[status]}`}
    >
      <Icon className="size-3" aria-hidden />
      {statusLabels[status]}
    </span>
  );
}

export function CalendarStatusBadge({
  status,
  generated,
  missing,
  stale,
}: {
  status: MenuRequirementAggregateStatus;
  generated: number;
  missing: number;
  stale: number;
}) {
  if (generated === 0 && missing === 0 && stale === 0) {
    return <EmptyStatusBadge />;
  }
  return <StatusBadge status={status} />;
}

export function EmptyStatusBadge() {
  return (
    <span className="inline-flex items-center border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      Немає даних
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="border border-slate-200 bg-white px-2 py-1">
      <span className="block font-bold text-slate-950">{value}</span>
      <span className="block text-[11px] text-slate-500">{label}</span>
    </span>
  );
}
