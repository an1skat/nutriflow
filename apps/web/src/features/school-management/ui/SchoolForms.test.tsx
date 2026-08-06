import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateSchool, useUpdateSchool } from '../model/UseSchoolMutations';
import { CreateSchoolForm } from './CreateSchoolForm';
import { EditSchoolForm } from './EditSchoolForm';

vi.mock('../model/UseSchoolMutations', () => ({
  useCreateSchool: vi.fn(),
  useUpdateSchool: vi.fn(),
}));

describe('school community fields', () => {
  const createSchool = vi.fn();
  const updateSchool = vi.fn();

  beforeEach(() => {
    createSchool.mockReset();
    updateSchool.mockReset();
    createSchool.mockResolvedValue(undefined);
    updateSchool.mockResolvedValue(undefined);
    vi.mocked(useCreateSchool).mockReturnValue({
      mutateAsync: createSchool,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCreateSchool>);
    vi.mocked(useUpdateSchool).mockReturnValue({
      mutateAsync: updateSchool,
      isSuccess: false,
    } as unknown as ReturnType<typeof useUpdateSchool>);
  });

  it('submits the selected community when creating a school', async () => {
    render(<CreateSchoolForm />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Назва школи' }), {
      target: { value: 'Ліцей №2' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Громада' }), {
      target: { value: 'obukhivska' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Створити школу' }));

    await waitFor(() =>
      expect(createSchool).toHaveBeenCalledWith({
        name: 'Ліцей №2',
        community: 'obukhivska',
      })
    );
  });

  it('can clear the community when editing a school', async () => {
    render(
      <EditSchoolForm
        school={{
          id: 'school-1',
          name: 'Ліцей №1',
          community: 'obukhivska',
          admin_owner_id: 'owner-1',
          is_active: true,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        }}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Громада' })).toHaveValue('obukhivska');
    fireEvent.change(screen.getByRole('combobox', { name: 'Громада' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() =>
      expect(updateSchool).toHaveBeenCalledWith({
        name: 'Ліцей №1',
        community: null,
        is_active: true,
      })
    );
  });
});
