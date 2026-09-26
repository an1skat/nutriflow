import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SchoolDayReopeningPanel } from './SchoolDayReopeningPanel';

it('links to the shared daily calendar with school preselected', () => {
  render(<SchoolDayReopeningPanel schoolId="school-1" />);
  expect(screen.getByRole('link', { name: 'Відкрити календар' })).toHaveAttribute(
    'href',
    '/admin/daily-menus?school_id=school-1'
  );
});
