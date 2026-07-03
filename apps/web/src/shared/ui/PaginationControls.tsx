type PaginationControlsProps = {
  offset: number;
  limit: number;
  total: number;
  disabled?: boolean;
  onOffsetChange: (offset: number) => void;
};

export function PaginationControls({
  offset,
  limit,
  total,
  disabled = false,
  onOffsetChange,
}: PaginationControlsProps) {
  if (total <= limit) {
    return null;
  }

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.ceil(total / limit);

  return (
    <nav
      aria-label="Пагінація"
      className="mt-3 flex items-center justify-between gap-4 border-t border-[var(--nf-line)] pt-3"
    >
      <button
        type="button"
        disabled={disabled || offset === 0}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        className="nf-button"
      >
        Назад
      </button>
      <span className="text-xs text-slate-600">
        Сторінка {page} з {pageCount}
      </span>
      <button
        type="button"
        disabled={disabled || offset + limit >= total}
        onClick={() => onOffsetChange(offset + limit)}
        className="nf-button"
      >
        Далі
      </button>
    </nav>
  );
}
