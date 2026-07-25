from dataclasses import dataclass
from decimal import Decimal

from app.modules.identity.models import AgeGroup
from app.modules.menus.models import MealType
from app.modules.nutrition.domain import NormativeGroupCode, NormativeUnit


@dataclass(frozen=True)
class ToleranceRule:
    minimum_percent: Decimal
    maximum_percent: Decimal
    description: str


@dataclass(frozen=True)
class PortionOption:
    amount: Decimal
    unit: NormativeUnit
    product_variant: str | None = None


@dataclass(frozen=True)
class NutritionNorm:
    meal_type: MealType
    age_group: AgeGroup
    group_code: NormativeGroupCode
    group_name: str
    weekly_portions: Decimal
    portion_options: tuple[PortionOption, ...]
    characteristic: str
    frequency: str
    source_appendix: str
    tolerance: ToleranceRule

    @property
    def uses_portion_equivalents(self) -> bool:
        return len(self.portion_options) > 1

    @property
    def comparison_unit(self) -> NormativeUnit:
        if self.uses_portion_equivalents:
            return NormativeUnit.PORTION
        return self.portion_options[0].unit

    @property
    def required_amount_per_week(self) -> Decimal:
        if self.uses_portion_equivalents:
            return self.weekly_portions
        return self.weekly_portions * self.portion_options[0].amount


DEFAULT_TOLERANCE = ToleranceRule(
    minimum_percent=Decimal("90"),
    maximum_percent=Decimal("110"),
    description="Допустиме відхилення нетто-порції: до 10%.",
)

STRICT_WEEKLY_TOLERANCE = ToleranceRule(
    minimum_percent=Decimal("100"),
    maximum_percent=Decimal("100"),
    description="За тиждень маса цієї групи має бути виконана повністю.",
)

MINIMUM_HALF_TOLERANCE = ToleranceRule(
    minimum_percent=Decimal("50"),
    maximum_percent=Decimal("1000000"),
    description="Норма вважається виконаною від 50%.",
)

GROUP_NAMES = {
    NormativeGroupCode.VEGETABLES: "Овочі",
    NormativeGroupCode.FRUITS_BERRIES: "Фрукти та ягоди",
    NormativeGroupCode.JUICES: "Соки",
    NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS: "Сухофрукти, горіхи та насіння",
    NormativeGroupCode.CEREALS_GRAINS_LEGUMES: "Злакові, зернові та бобові",
    NormativeGroupCode.POTATOES: "Картопля",
    NormativeGroupCode.BREAD: "Хліб",
    NormativeGroupCode.FISH: "Риба",
    NormativeGroupCode.POULTRY: "Птиця",
    NormativeGroupCode.RED_MEAT: "Свинина, телятина, яловичина",
    NormativeGroupCode.EGGS: "Яйця",
    NormativeGroupCode.DAIRY: "Молоко і молочні продукти",
    NormativeGroupCode.ANIMAL_FATS: "Насичені жири тваринного походження",
    NormativeGroupCode.VEGETABLE_FATS: "Рослинні жири",
    NormativeGroupCode.SALT: "Сіль",
    NormativeGroupCode.SUGAR: "Цукор",
    NormativeGroupCode.COCOA: "Какао",
    NormativeGroupCode.TEA: "Чай",
}


@dataclass(frozen=True)
class _Row:
    code: NormativeGroupCode
    characteristic: str
    frequency: str
    weekly_portions: Decimal
    amounts: tuple[Decimal, Decimal, Decimal]
    unit: NormativeUnit
    options: tuple[tuple[str, Decimal, NormativeUnit], ...] = ()


_AGES = (
    AgeGroup.SIX_TO_ELEVEN,
    AgeGroup.ELEVEN_TO_FOURTEEN,
    AgeGroup.FOURTEEN_TO_EIGHTEEN,
)


def _d(value: str | int) -> Decimal:
    return Decimal(str(value))


def _tolerance_for(code: NormativeGroupCode) -> ToleranceRule:
    if code in {NormativeGroupCode.FISH, NormativeGroupCode.POULTRY, NormativeGroupCode.RED_MEAT}:
        return STRICT_WEEKLY_TOLERANCE
    if code in {
        NormativeGroupCode.SALT,
        NormativeGroupCode.SUGAR,
        NormativeGroupCode.COCOA,
        NormativeGroupCode.TEA,
    }:
        return MINIMUM_HALF_TOLERANCE
    return DEFAULT_TOLERANCE


_BREAKFAST_ROWS = (
    _Row(
        NormativeGroupCode.VEGETABLES,
        "різноманітні, сезонні, крім картоплі",
        "щодня разом із зеленню",
        _d(5),
        (_d(100), _d(120), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.FRUITS_BERRIES,
        "різноманітні, сезонні, свіжі або заморожені",
        "щодня",
        _d(5),
        (_d(100), _d(100), _d(100)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.JUICES,
        "пастеризовані або стерилізовані без додавання цукрів",
        "один раз на тиждень",
        _d(1),
        (_d(200), _d(200), _d(200)),
        NormativeUnit.MILLILITER,
    ),
    _Row(
        NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS,
        "різноманітні, без додавання цукрів і підсолоджувачів",
        "два рази на тиждень",
        _d(2),
        (_d(25), _d(25), _d(25)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES,
        "каші, бобові або макарони; перевага виробам з харчовими волокнами",
        "чотири рази на тиждень; бобові принаймні один раз",
        _d(4),
        (_d(120), _d(150), _d(150)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.POTATOES,
        "відварена, запечена, тушкована або пюре",
        "один раз на тиждень",
        _d(1),
        (_d(120), _d(150), _d(150)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.BREAD,
        "цільнозерновий, з високим вмістом харчових волокон",
        "три рази на тиждень",
        _d(3),
        (_d(30), _d(50), _d(50)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.FISH,
        "морська риба, філе без кісток",
        "один раз на тиждень",
        _d(1),
        (_d(60), _d(90), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.POULTRY,
        "крім водоплавної, без шкіри та кісток",
        "два рази на тиждень",
        _d(2),
        (_d(70), _d(100), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.EGGS,
        "приготовлені до повної готовності",
        "один раз на тиждень",
        _d(1),
        (_d(1), _d(1), _d(1)),
        NormativeUnit.ITEM,
    ),
    _Row(
        NormativeGroupCode.DAIRY,
        "без надлишку цукрів; бажано з вітаміном D",
        "щодня",
        _d(5),
        (_d(1), _d(1), _d(1)),
        NormativeUnit.PORTION,
        options=(
            ("milk", _d(200), NormativeUnit.MILLILITER),
            ("yogurt", _d(125), NormativeUnit.MILLILITER),
            ("kefir", _d(125), NormativeUnit.MILLILITER),
            ("cottage_cheese", _d(125), NormativeUnit.GRAM),
            ("soft_cheese", _d(75), NormativeUnit.GRAM),
            ("hard_cheese", _d(15), NormativeUnit.GRAM),
            ("sour_cream", _d(25), NormativeUnit.GRAM),
        ),
    ),
    _Row(
        NormativeGroupCode.ANIMAL_FATS,
        "масло вершкове не менше 72% жиру",
        "щодня",
        _d(5),
        (_d("3"), _d("4"), _d("4.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.VEGETABLE_FATS,
        "рафінована рослинна олія",
        "щодня",
        _d(5),
        (_d("5.5"), _d("6.5"), _d("7.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.SALT,
        "лише йодована; кількість обмежується",
        "щодня",
        _d(5),
        (_d(1), _d("1.5"), _d("1.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.SUGAR,
        "додавання цукру та меду обмежується",
        "щодня",
        _d(5),
        (_d("7.5"), _d("7.5"), _d("7.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.COCOA,
        "без додавання цукрів та підсолоджувачів",
        "один раз на тиждень",
        _d(1),
        (_d(6), _d(6), _d(6)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.TEA,
        "без додавання цукрів та підсолоджувачів",
        "один раз на тиждень",
        _d(1),
        (_d("0.5"), _d("0.5"), _d("0.5")),
        NormativeUnit.GRAM,
    ),
)

_LUNCH_ROWS = (
    _Row(
        NormativeGroupCode.VEGETABLES,
        "різноманітні, сезонні, крім картоплі",
        "щодня разом із зеленню",
        _d(5),
        (_d(100), _d(120), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.FRUITS_BERRIES,
        "різноманітні, сезонні, свіжі або заморожені",
        "щодня",
        _d(5),
        (_d(100), _d(100), _d(100)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.JUICES,
        "пастеризовані або стерилізовані без додавання цукрів",
        "один раз на тиждень",
        _d(1),
        (_d(200), _d(200), _d(200)),
        NormativeUnit.MILLILITER,
    ),
    _Row(
        NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS,
        "різноманітні, без додавання цукрів і підсолоджувачів",
        "два рази на тиждень",
        _d(2),
        (_d(25), _d(25), _d(25)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES,
        "каші, бобові або макарони; також у перших стравах",
        "бобові принаймні один раз на тиждень",
        _d(5),
        (_d(120), _d(150), _d(150)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.POTATOES,
        "відварена, запечена, тушкована, пюре або у перших стравах",
        "два рази на тиждень",
        _d(2),
        (_d(120), _d(150), _d(150)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.BREAD,
        "цільнозерновий, з високим вмістом харчових волокон",
        "щодня",
        _d(5),
        (_d(30), _d(30), _d(30)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.FISH,
        "морська риба, філе без кісток",
        "один раз на тиждень",
        _d(1),
        (_d(60), _d(90), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.POULTRY,
        "крім водоплавної, без шкіри та кісток",
        "один раз на тиждень",
        _d(1),
        (_d(70), _d(100), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.RED_MEAT,
        "нежирні частини тушки, без кістки",
        "три рази на тиждень",
        _d(3),
        (_d(70), _d(100), _d(120)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.EGGS,
        "приготовлені до повної готовності",
        "один раз на тиждень",
        _d(1),
        (_d(1), _d(1), _d(1)),
        NormativeUnit.ITEM,
    ),
    _Row(
        NormativeGroupCode.DAIRY,
        "сир м’який, твердий або сметана",
        "три рази на тиждень",
        _d(3),
        (_d(1), _d(1), _d(1)),
        NormativeUnit.PORTION,
        options=(
            ("soft_cheese", _d(75), NormativeUnit.GRAM),
            ("hard_cheese", _d(15), NormativeUnit.GRAM),
            ("sour_cream", _d(25), NormativeUnit.GRAM),
        ),
    ),
    _Row(
        NormativeGroupCode.ANIMAL_FATS,
        "масло вершкове не менше 72% жиру",
        "щодня",
        _d(5),
        (_d("3.5"), _d("4.5"), _d("5.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.VEGETABLE_FATS,
        "рафінована рослинна олія",
        "щодня",
        _d(5),
        (_d(10), _d(11), _d(12)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.SALT,
        "лише йодована; кількість обмежується",
        "щодня",
        _d(5),
        (_d(1), _d("1.5"), _d("1.5")),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.SUGAR,
        "додавання цукру та меду обмежується",
        "щодня",
        _d(5),
        (_d(10), _d(10), _d(10)),
        NormativeUnit.GRAM,
    ),
    _Row(
        NormativeGroupCode.TEA,
        "без додавання цукрів та підсолоджувачів",
        "один раз на тиждень",
        _d(1),
        (_d("0.5"), _d("0.5"), _d("0.5")),
        NormativeUnit.GRAM,
    ),
)


def _build_registry() -> tuple[NutritionNorm, ...]:
    result: list[NutritionNorm] = []
    for meal_type, appendix, rows in (
        (MealType.BREAKFAST, "9", _BREAKFAST_ROWS),
        (MealType.LUNCH, "9-1", _LUNCH_ROWS),
    ):
        for row in rows:
            for index, age_group in enumerate(_AGES):
                options = (
                    tuple(
                        PortionOption(amount, unit, variant)
                        for variant, amount, unit in row.options
                    )
                    if row.options
                    else (PortionOption(row.amounts[index], row.unit),)
                )
                result.append(
                    NutritionNorm(
                        meal_type=meal_type,
                        age_group=age_group,
                        group_code=row.code,
                        group_name=GROUP_NAMES[row.code],
                        weekly_portions=row.weekly_portions,
                        portion_options=options,
                        characteristic=row.characteristic,
                        frequency=row.frequency,
                        source_appendix=appendix,
                        tolerance=_tolerance_for(row.code),
                    )
                )
    return tuple(result)


NUTRITION_NORMS = _build_registry()
_NORM_INDEX = {(item.meal_type, item.age_group, item.group_code): item for item in NUTRITION_NORMS}


def get_norms(meal_type: MealType, age_group: AgeGroup) -> tuple[NutritionNorm, ...]:
    return tuple(
        norm
        for norm in NUTRITION_NORMS
        if norm.meal_type == meal_type and norm.age_group == age_group
    )


def get_norm(
    meal_type: MealType,
    age_group: AgeGroup,
    group_code: NormativeGroupCode,
) -> NutritionNorm | None:
    return _NORM_INDEX.get((meal_type, age_group, group_code))
