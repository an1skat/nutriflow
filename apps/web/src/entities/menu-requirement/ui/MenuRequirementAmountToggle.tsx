'use client';

import type { MenuRequirementAmountBasis } from '../model/MenuRequirement';

const options: Array<{ value: MenuRequirementAmountBasis; label: string }> = [
  { value: 'gross', label: 'Брутто' },
  { value: 'net', label: 'Нетто' },
];

export function MenuRequirementAmountToggle({
  value,
  onChange,
}: {
  value: MenuRequirementAmountBasis;
  onChange: (value: MenuRequirementAmountBasis) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 border border-slate-300 bg-white"
      role="group"
      aria-label="Тип ваги інгредієнтів"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`min-h-8 px-3 text-xs font-semibold transition-colors ${
              selected ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
            }`}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
