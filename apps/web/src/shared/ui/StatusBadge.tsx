type StatusBadgeProps = {
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
};

export function StatusBadge({
  isActive,
  activeLabel = "Активна",
  inactiveLabel = "Неактивна",
}: StatusBadgeProps) {
  const label = isActive ? activeLabel : inactiveLabel;
  const className = isActive
    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
    : "border-amber-500 bg-amber-50 text-amber-800";

  return (
    <span
      className={`inline-flex border px-2 py-0.5 text-[11px] font-bold ${className}`}
    >
      {label}
    </span>
  );
}
