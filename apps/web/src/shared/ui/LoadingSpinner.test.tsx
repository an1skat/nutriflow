import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('announces the loading label and animates its icon', () => {
    const { container } = render(<LoadingSpinner label="Завантажуємо школи…" size="sm" />);

    expect(screen.getByRole('status')).toHaveTextContent('Завантажуємо школи…');
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });
});
