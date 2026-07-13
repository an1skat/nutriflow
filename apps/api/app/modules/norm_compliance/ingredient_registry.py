from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal

from app.modules.norm_compliance.domain import NormativeGroupCode, NormativeUnit


@dataclass(frozen=True)
class IngredientNormRule:
    group_code: NormativeGroupCode
    unit: NormativeUnit = NormativeUnit.GRAM
    product_variant: str | None = None
    divisor: Decimal = Decimal("1")
    count_directly: bool = True
    whole_items: bool = False

    def contribution_amount(self, source_amount: Decimal) -> Decimal | None:
        if not self.count_directly:
            return None
        amount = source_amount / self.divisor
        if self.whole_items:
            amount = amount.to_integral_value(rounding=ROUND_FLOOR)
            return amount if amount > 0 else None
        return amount


def _rule(
    group_code: NormativeGroupCode,
    *,
    unit: NormativeUnit = NormativeUnit.GRAM,
    product_variant: str | None = None,
    divisor: str = "1",
    count_directly: bool = True,
    whole_items: bool = False,
) -> IngredientNormRule:
    return IngredientNormRule(
        group_code=group_code,
        unit=unit,
        product_variant=product_variant,
        divisor=Decimal(divisor),
        count_directly=count_directly,
        whole_items=whole_items,
    )


# This is an explicit catalog registry, not a keyword classifier. Every name is
# reviewed independently. Names absent from the registry are not guessed.
INGREDIENT_NORM_RULES: dict[str, IngredientNormRule] = {
    # Fruit and berries.
    "абрикос": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "апельсин": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "банан": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "виноград": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "вишня": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "груша": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "диня": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "кавун": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "мандарин": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "персик": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "полуниця": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "слива": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "черешня": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "яблука свіжі": _rule(NormativeGroupCode.FRUITS_BERRIES),
    "яблуко": _rule(NormativeGroupCode.FRUITS_BERRIES),
    # Dried fruit.
    "чорнослив без кісточки": _rule(NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS),
    "чорнослив з кісточкою": _rule(NormativeGroupCode.DRIED_FRUITS_NUTS_SEEDS),
    # Vegetables. Potato is deliberately handled separately below.
    "буряк свіжий": _rule(NormativeGroupCode.VEGETABLES),
    "буряк столовий свіжий до 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "буряк столовий свіжий з 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "гарбуз свіжий": _rule(NormativeGroupCode.VEGETABLES),
    "зелень кропу свіжого": _rule(NormativeGroupCode.VEGETABLES),
    "зелень петрушки свіжої": _rule(NormativeGroupCode.VEGETABLES),
    "капуста білоголова свіжа": _rule(NormativeGroupCode.VEGETABLES),
    "капуста білокачанна квашена": _rule(NormativeGroupCode.VEGETABLES),
    "капуста білокачанна молода": _rule(NormativeGroupCode.VEGETABLES),
    "капуста білокачанна свіжа": _rule(NormativeGroupCode.VEGETABLES),
    "капуста білокочанна свіжа": _rule(NormativeGroupCode.VEGETABLES),
    "капуста пекінська свіжа": _rule(NormativeGroupCode.VEGETABLES),
    "кріп свіжий": _rule(NormativeGroupCode.VEGETABLES),
    "морква свіжа до 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "морква свіжа з 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "морква столова свіжа до 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "морква столова свіжа з 01.01": _rule(NormativeGroupCode.VEGETABLES),
    "огірки грунтові свіжі": _rule(NormativeGroupCode.VEGETABLES),
    "огірки теплично-парникові свіжі": _rule(NormativeGroupCode.VEGETABLES),
    "петрушка корінь": _rule(NormativeGroupCode.VEGETABLES),
    "селери корінь": _rule(NormativeGroupCode.VEGETABLES),
    "томати теплично-парникові свіжі": _rule(NormativeGroupCode.VEGETABLES),
    "томати ґрунтові свіжі": _rule(NormativeGroupCode.VEGETABLES),
    "цибуля зелена": _rule(NormativeGroupCode.VEGETABLES),
    "цибуля ріпчаста": _rule(NormativeGroupCode.VEGETABLES),
    # Potato.
    "картопля молода до 01.09": _rule(NormativeGroupCode.POTATOES),
    "картопля свіжа з 01.01 по 28–29.02": _rule(NormativeGroupCode.POTATOES),
    "картопля свіжа з 01.03": _rule(NormativeGroupCode.POTATOES),
    "картопля свіжа з 01.03 по 01.09": _rule(NormativeGroupCode.POTATOES),
    "картопля свіжа з 01.09 по 31.10": _rule(NormativeGroupCode.POTATOES),
    "картопля свіжа з 01.11 по 31.12": _rule(NormativeGroupCode.POTATOES),
    # Grain, cereal, legume and pasta inputs. NutriFlow compares their net
    # amounts from the menu requirement, consistently with the existing domain
    # workflow for ingredient-based compliance.
    "булгур": _rule(NormativeGroupCode.CEREALS_GRAINS_LEGUMES),
    "вівсяна каша чи вівсяні пластівці «геркулес»": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "горох жовтий сухий": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "горох сушений": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "горошок зелений свіжоморожений": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "гречана крупа": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа булгур": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа гречана": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа перлова": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа пшенична": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа рисова": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "крупа рисова або пшенична": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "макарони з твердих сортів пшениці": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    "макаронні вироби": _rule(
        NormativeGroupCode.CEREALS_GRAINS_LEGUMES
    ),
    # Bread and bread products.
    "хліб цільнозерновий": _rule(NormativeGroupCode.BREAD),
    "сухарики (хліб сімейний)": _rule(NormativeGroupCode.BREAD),
    # Meat, poultry and fish use net ingredient mass.
    "свинина великим шматком охолоджена": _rule(NormativeGroupCode.RED_MEAT),
    "свинина великими шматками охолоджена": _rule(NormativeGroupCode.RED_MEAT),
    "яловичина великими шматками охолоджена": _rule(NormativeGroupCode.RED_MEAT),
    "філе куряче": _rule(NormativeGroupCode.POULTRY),
    "філе минтая зі шкірою, що вироблене промисловістю": _rule(
        NormativeGroupCode.FISH
    ),
    # Appendix 9/9-1 counts eggs as whole items: one portion is one piece.
    "яйце": _rule(
        NormativeGroupCode.EGGS,
        unit=NormativeUnit.ITEM,
        divisor="40",
        whole_items=True,
    ),
    "яйце куряче": _rule(
        NormativeGroupCode.EGGS,
        unit=NormativeUnit.ITEM,
        divisor="40",
        whole_items=True,
    ),
    "яйця": _rule(
        NormativeGroupCode.EGGS,
        unit=NormativeUnit.ITEM,
        divisor="40",
        whole_items=True,
    ),
    "яйця курячі": _rule(
        NormativeGroupCode.EGGS,
        unit=NormativeUnit.ITEM,
        divisor="40",
        whole_items=True,
    ),
    # Dairy portion variants from Appendix 9/9-1.
    "молоко": _rule(
        NormativeGroupCode.DAIRY,
        unit=NormativeUnit.MILLILITER,
        product_variant="milk",
    ),
    "молоко 2,5%": _rule(
        NormativeGroupCode.DAIRY,
        unit=NormativeUnit.MILLILITER,
        product_variant="milk",
    ),
    "молоко коров’яче питне 2,5%": _rule(
        NormativeGroupCode.DAIRY,
        unit=NormativeUnit.MILLILITER,
        product_variant="milk",
    ),
    "молоко пастеризоване": _rule(
        NormativeGroupCode.DAIRY,
        unit=NormativeUnit.MILLILITER,
        product_variant="milk",
    ),
    "сир кисломолочний": _rule(
        NormativeGroupCode.DAIRY, product_variant="cottage_cheese"
    ),
    "сир твердий": _rule(NormativeGroupCode.DAIRY, product_variant="hard_cheese"),
    "сметана": _rule(NormativeGroupCode.DAIRY, product_variant="sour_cream"),
    "сметана для подачі": _rule(
        NormativeGroupCode.DAIRY, product_variant="sour_cream"
    ),
    # Fats.
    "вершкове масло": _rule(NormativeGroupCode.ANIMAL_FATS),
    "масло вершкове": _rule(NormativeGroupCode.ANIMAL_FATS),
    "масло гхі": _rule(NormativeGroupCode.ANIMAL_FATS),
    "олія": _rule(NormativeGroupCode.VEGETABLE_FATS),
    "олія ароматна": _rule(NormativeGroupCode.VEGETABLE_FATS),
    "олія соняшникова": _rule(NormativeGroupCode.VEGETABLE_FATS),
    "олія соняшникова для деко": _rule(NormativeGroupCode.VEGETABLE_FATS),
    "олія соняшникова для змащування деко": _rule(NormativeGroupCode.VEGETABLE_FATS),
    "олія соняшникова рафінована": _rule(NormativeGroupCode.VEGETABLE_FATS),
    # Limited products.
    "сіль": _rule(NormativeGroupCode.SALT),
    "сіль йодована": _rule(NormativeGroupCode.SALT),
    "сіль харчова": _rule(NormativeGroupCode.SALT),
    "цукор": _rule(NormativeGroupCode.SUGAR),
    "цукор білий кристалічний": _rule(NormativeGroupCode.SUGAR),
    "какао-порошок": _rule(NormativeGroupCode.COCOA),
    "чай вищого гатунку": _rule(NormativeGroupCode.TEA),
}


# Explicitly reviewed catalog items that must not create an independent norm
# contribution: water, flour, seasonings, starches, breading, sauces and
# composite semifinished products. Their underlying ingredients are counted
# instead when they are part of a normative product group.
INGREDIENTS_NOT_COUNTED_SEPARATELY = frozenset(
    {
        "базилік сушений мелений",
        "борошно пшеничне цільнозернове",
        "борошно пшеничне цільнозернове або крохмаль кукурудзяний",
        "борошно цільнозернове",
        "ванілін",
        "вода",
        "вода питна",
        "вода питна для варіння рису",
        "відвар овочевий напівфабрикат",
        "гвоздика ціла",
        "заправка для салату",
        "зіра",
        "кмин",
        "кмин сухий (зерна)",
        "коріандр мелений",
        "коріандр сухий мелений",
        "крохмаль картопляний",
        "крохмаль кукурудзяний",
        "кріп або петрушка сушені",
        "кріп сушений",
        "лавровий лист",
        "лист лавровий",
        "маса пасерованих овочів",
        "маса соус гуляш для подачі",
        "маса тушкованого м’яса",
        "мускатний горіх мелений",
        "орегано сухий",
        "орегано сушений",
        "панірувальні сухарі",
        "паприка мелена",
        "паприка мелена копчена",
        "перець духмяний",
        "перець духмяний горошком",
        "перець чорний мелений",
        "перець чорний молотий",
        "прянощі орегано сухе",
        "соус «ароматна олія»",
        "соус «бешамель»",
        "соус вінегрет",
        "соус медово-гірчичний",
        "сухарі панірувальні",
        "сухарі панірувальні пшеничні мелені",
        "сушений орегано",
        "сік лимона",
        "томатна паста",
        "хмелі-сунелі",
        "чебрець сухий (тим’ян сухий)",
        "чебрець сушений мелений",
        "цукор ванільний",
        "ягідне кулі (тк № 11.15)",
    }
)


def get_ingredient_norm_rule(normalized_name: str) -> IngredientNormRule | None:
    return INGREDIENT_NORM_RULES.get(normalized_name)
