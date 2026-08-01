import { LoaderCircle } from 'lucide-react';

type LoadingSpinnerProps = {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  visuallyHiddenLabel?: boolean;
};

const iconSizes = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-7',
} as const;

export function LoadingSpinner({
  label,
  size = 'md',
  className,
  visuallyHiddenLabel = false,
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-sm text-slate-600 ${className ?? ''}`}
    >
      <LoaderCircle className={`${iconSizes[size]} animate-spin`} aria-hidden="true" />
      <span className={visuallyHiddenLabel ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}
