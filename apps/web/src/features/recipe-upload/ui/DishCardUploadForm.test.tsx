import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllergens, useDishCards } from '@/entities/recipe/api/RecipeQueries';

import { useUploadDishCard } from '../model/UseRecipeUpload';
import { DishCardUploadForm } from './DishCardUploadForm';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  useAllergens: vi.fn(),
  useDishCards: vi.fn(),
}));

vi.mock('../model/UseRecipeUpload', () => ({
  useUploadDishCard: vi.fn(),
}));

const invalidFormMessage = 'Є незаповнені або некоректні поля. Перевірте підсвічені поля.';

function input(container: HTMLElement, selector: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(selector);
  expect(element).not.toBeNull();
  return element!;
}

function inputs(container: HTMLElement, selector: string): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>(selector));
}

function fillValidForm(container: HTMLElement) {
  fireEvent.change(input(container, '#card-number'), { target: { value: '1.17' } });
  fireEvent.change(input(container, '#dish-name'), { target: { value: 'Салат' } });
  fireEvent.change(input(container, '[name="ingredients.0.ingredient_name_snapshot"]'), {
    target: { value: 'Морква' },
  });
  fireEvent.change(input(container, '[name$=".gross"]'), { target: { value: '10' } });
  fireEvent.change(input(container, '[name$=".net"]'), { target: { value: '9' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти та підтвердити техкарту' }));
}

describe('DishCardUploadForm', () => {
  const uploadDishCard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    uploadDishCard.mockResolvedValue({ dishCardId: 'card-1', versionId: 'version-1' });
    vi.mocked(useUploadDishCard).mockReturnValue({
      mutateAsync: uploadDishCard,
      isPending: false,
    } as unknown as ReturnType<typeof useUploadDishCard>);
    vi.mocked(useAllergens).mockReturnValue({
      data: { items: [], total: 0, offset: 0, limit: 100 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAllergens>);
    vi.mocked(useDishCards).mockReturnValue({
      data: { items: [], total: 0, offset: 0, limit: 100 },
    } as unknown as ReturnType<typeof useDishCards>);
  });

  it('submits a valid form exactly once', async () => {
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);

    submit();

    await waitFor(() => expect(uploadDishCard).toHaveBeenCalledTimes(1));
    expect(uploadDishCard).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ card_number: '1.17', name: 'Салат' }),
        onProgress: expect.any(Function),
      })
    );
  });

  it('shows and navigates to the second ingredient third-portion gross error', async () => {
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);
    fireEvent.click(screen.getByRole('button', { name: 'Додати порцію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Додати порцію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Додати інгредієнт' }));

    inputs(container, '[name$=".portion_grams"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: String(120 + index * 60) } })
    );
    inputs(container, '[name$=".ingredient_name_snapshot"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: `Інгредієнт ${index + 1}` } })
    );
    inputs(container, '[name$=".gross"]').forEach((field) =>
      fireEvent.change(field, { target: { value: '10' } })
    );
    inputs(container, '[name$=".net"]').forEach((field) =>
      fireEvent.change(field, { target: { value: '9' } })
    );

    const gross = inputs(container, '[name^="ingredients.1.amounts."][name$=".gross"]')[2];
    const net = input(container, `[name="${gross.name.replace(/\.gross$/, '.net')}"]`);
    const scrollIntoView = vi.fn();
    gross.scrollIntoView = scrollIntoView;
    fireEvent.change(gross, { target: { value: '' } });
    input(container, '#card-number').focus();

    submit();

    const amountCell = gross.parentElement!.parentElement!;
    expect(await within(amountCell).findByRole('alert')).toHaveTextContent('Введіть значення');
    expect(gross.name).toMatch(/^ingredients\.1\.amounts\.portion-[a-z0-9]+\.gross$/);
    expect(gross).toHaveAttribute('aria-invalid', 'true');
    expect(net).not.toHaveAttribute('aria-invalid');
    expect(uploadDishCard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(invalidFormMessage);
    await waitFor(() => expect(gross).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(gross).toHaveValue('');
  });

  it('keeps a missing net error beside its amount cell and does not upload', async () => {
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);
    const net = input(container, '[name$=".net"]');
    fireEvent.change(net, { target: { value: '' } });

    submit();

    const amountCell = net.parentElement!.parentElement!;
    expect(await within(amountCell).findByRole('alert')).toHaveTextContent('Введіть значення');
    expect(uploadDishCard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(invalidFormMessage);
    await waitFor(() => expect(net).toHaveFocus());
    expect(net).toHaveValue('');
  });

  it('does not render deprecated alternative metadata fields', () => {
    const { container } = render(<DishCardUploadForm />);

    expect(container.querySelector('[name$=".group_key"]')).toBeNull();
    expect(container.querySelector('[name$=".alternative_label"]')).toBeNull();
  });

  it('submits and transforms a production-like form with three portions and six ingredients', async () => {
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);
    fireEvent.click(screen.getByRole('button', { name: 'Додати порцію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Додати порцію' }));
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Додати інгредієнт' }));
    }

    inputs(container, '[name$=".portion_grams"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: String(120 + index * 60) } })
    );
    inputs(container, '[name$=".ingredient_name_snapshot"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: `Інгредієнт ${index + 1}` } })
    );
    inputs(container, '[name$=".gross"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: String(index + 10) } })
    );
    inputs(container, '[name$=".net"]').forEach((field, index) =>
      fireEvent.change(field, { target: { value: String(index + 9) } })
    );
    const portionGrams = inputs(container, '[name$=".portion_grams"]');
    const grossAmounts = inputs(container, '[name$=".gross"]');
    const netAmounts = inputs(container, '[name$=".net"]');
    fireEvent.change(portionGrams[1], { target: { value: '180,5' } });
    fireEvent.change(inputs(container, '[name$=".kcal"]')[1], { target: { value: '' } });
    fireEvent.change(grossAmounts[7], { target: { value: '10,5' } });
    fireEvent.change(netAmounts[7], { target: { value: '9,25' } });

    submit();

    await waitFor(() => expect(uploadDishCard).toHaveBeenCalledTimes(1));
    const values = uploadDishCard.mock.calls[0][0].values;
    expect(values.portions).toHaveLength(3);
    expect(values.ingredients).toHaveLength(6);
    expect(values.portions[1]).toMatchObject({ portion_grams: '180.5', kcal: '' });
    expect(values.ingredients[2].amounts[values.portions[1].tempId]).toEqual({
      gross: '10.5',
      net: '9.25',
    });
    expect(values).toMatchObject({ category: '', source: '', technology_text: '' });
  });

  it('keeps entered data and shows a clear server error', async () => {
    uploadDishCard.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: 'Dish card with this number already exists' },
      },
    });
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);

    submit();

    const message = 'Техкарта з таким номером уже існує.';
    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent(message);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(input(container, '#card-number')).toHaveValue('1.17');
    expect(input(container, '[name="ingredients.0.ingredient_name_snapshot"]')).toHaveValue(
      'Морква'
    );
    expect(input(container, '[name$=".gross"]')).toHaveValue('10');
    expect(screen.getByRole('button', { name: 'Зберегти та підтвердити техкарту' })).toBeEnabled();
  });

  it.each([
    [
      'generic 4xx',
      { isAxiosError: true, response: { status: 400, data: {} } },
      'Не вдалося виконати запит.',
    ],
    [
      'server 500',
      { isAxiosError: true, response: { status: 500, data: {} } },
      'Помилка сервера. Повторіть спробу пізніше.',
    ],
    [
      'network failure',
      { isAxiosError: true },
      'API недоступний. Перевірте з’єднання та повторіть спробу.',
    ],
  ])('recovers from %s without clearing the form', async (_case, error, message) => {
    uploadDishCard.mockRejectedValue(error);
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);

    submit();

    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent(message);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(input(container, '#card-number')).toHaveValue('1.17');
    expect(screen.getByRole('button', { name: 'Зберегти та підтвердити техкарту' })).toBeEnabled();
    expect(screen.queryByText('Створюємо картку страви…')).not.toBeInTheDocument();
  });

  it('resets only after the full upload succeeds', async () => {
    const { container } = render(<DishCardUploadForm />);
    fillValidForm(container);

    submit();

    expect(await screen.findByText('Техкарту збережено та підтверджено.')).toHaveAttribute(
      'role',
      'status'
    );
    expect(toast.success).toHaveBeenCalledWith('Техкарту завантажено');
    expect(input(container, '#card-number')).toHaveValue('');
    expect(input(container, '#dish-name')).toHaveValue('');
  });
});
