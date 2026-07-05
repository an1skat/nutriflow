"""Import Ukrainian school-canteen TK PDFs into MongoDB via the recipe service.

One-shot script (not committed). Parses the PDF, builds dish cards + confirmed
versions through the same service functions the API uses, and prints a per-card
report so data issues surface and can be fixed before confirm.

Usage:
    uv run python -m app.scripts.import_tk_pdf <pdf>... [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from decimal import Decimal
from pathlib import Path

from beanie import PydanticObjectId
from pypdf import PdfReader

from app.db.beanie import init_odm
from app.db.mongo import close_mongo, connect_mongo
from app.modules.recipe.models import (
    Allergen,
    DishCard,
    Ingredient,
)
from app.modules.recipe.schemas import (
    CreateAllergenRequest,
    CreateDishCardRequest,
    CreateDishCardVersionRequest,
    CreateIngredientRequest,
    IngredientAmountPayload,
    NutritionPayload,
    PortionVariantPayload,
)
from app.modules.recipe.service import (
    RecipeConflictError,
    confirm_dish_card_version,
    create_allergen,
    create_dish_card,
    create_dish_card_version,
    create_ingredient,
    list_allergens,
    list_ingredients,
    validate_dish_card_version,
)

# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

NUMBER_TOKEN = re.compile(r"^-?\d+(?:[.,]\d+)?$")
DASH_TOKEN = re.compile(r"^[-–—]$")
DATE_TOKEN = re.compile(r"\b\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?\b")
SUBRECIPE_TOKEN = re.compile(r"ТК\s*№\s*\d+(?:[.,]\d+)*", re.IGNORECASE)
ALLERGEN_PARENS = re.compile(r"\(([^()]*[A-ZА-ЯІЇЄ][^()]*)\)\s*$")

KNOWN_ALLERGEN_LABELS: dict[str, str] = {
    "ГЦ": "Гірчиця",
    "МП": "Молочні продукти",
    "Л": "Лактоза",
    "С": "Селера",
    "Ц": "Цукор",
    "Г": "Глютен",
    "Я": "Яйця",
    "Р": "Риба",
    "А": "Арахіс",
    "СО": "Соя",
    "КС": "Кунжут",
}


def is_number(token: str | None) -> bool:
    if token is None:
        return False
    return bool(NUMBER_TOKEN.match(token.replace(",", ".")))


def is_dash(token: str | None) -> bool:
    if token is None:
        return False
    return bool(DASH_TOKEN.match(token))


def coerce_decimal(token: str | None) -> Decimal | None:
    if token is None or is_dash(token):
        return None
    if is_number(token):
        return Decimal(token.replace(",", "."))
    return None


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


# ---------------------------------------------------------------------------
# Card splitting
# ---------------------------------------------------------------------------


def _is_section_divider(line: str) -> bool:
    lower = line.lower()
    return any(
        marker in lower
        for marker in (
            "збірник рецептур",
            "сборник рецептур",
            "видання",
            "лапшина",
            "«сборник",
            "«збірник",
        )
    )


def _guess_dish_name(lines: list[str], header_index: int) -> str:
    for line in lines[header_index + 1 :]:
        if re.match(r"Категорія:", line, re.IGNORECASE):
            break
        if not line:
            continue
        if _is_section_divider(line):
            continue
        if re.match(r"[_\-\s\d.р]+$", line):
            continue
        return line
    return ""


def split_cards(pages: list[str]) -> list[tuple[str, str, list[str]]]:
    """Return [(card_number, name, page_texts)]."""
    header_re = re.compile(r"Технологічна\s+карта\s*№\s*(\S+)")
    cards: list[tuple[str, str, list[str]]] = []
    current: tuple[str, str, list[str]] | None = None

    for page_text in pages:
        header_match = header_re.search(page_text)
        if header_match:
            card_number = header_match.group(1).strip()
            lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
            try:
                header_index = next(
                    i for i, ln in enumerate(lines) if header_re.search(ln)
                )
            except StopIteration:
                header_index = -1
            name = _guess_dish_name(lines, header_index) if header_index >= 0 else ""

            has_table = "Норма вмісту" in page_text or "Найменування сировини" in page_text
            if current is not None and current[0] == card_number and not has_table:
                continue
            if current is not None and current[0] == card_number and has_table:
                current = (card_number, name or current[1], [page_text])
                cards[-1] = current
                continue
            current = (card_number, name, [page_text])
            cards.append(current)
        elif current is not None:
            current[2].append(page_text)

    return cards


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------


def extract_category(text: str) -> str | None:
    match = re.search(r"Категорія:\s*(.+)", text)
    if not match:
        return None
    return " ".join(match.group(1).splitlines()[0].split())


def extract_technology(text: str) -> str | None:
    match = re.search(
        r"Технологія приготування страви\s+(.*?)"
        r"(?:Термін придатності|Спосіб реалізації|Характеристика|ХАРЧОВА|$)",
        text,
        re.DOTALL,
    )
    if not match:
        return None
    body = match.group(1).split("Термін придатності")[0]
    return _clean_paragraph(body)


def extract_allergen_codes(text: str) -> list[str]:
    codes: list[str] = []
    line_match = re.search(r"Наявність харчових алергенів у страві:\s*(.+)", text)
    if line_match:
        line = line_match.group(1).splitlines()[0]
        if "відсутні" not in line.lower():
            for token in re.findall(r"\b([A-ZА-ЯІЇЄ]{1,4})\b\s*—", line):
                if token not in codes:
                    codes.append(token)
    for paren in re.findall(r"\(([A-ZА-ЯІЇЄ ,.\-]+)\)", text):
        for token in re.split(r"[,;/]+", paren):
            token = token.strip()
            if token and token.isupper() and len(token) <= 4:
                if token not in codes:
                    codes.append(token)
    return codes


def extract_portion_outputs(text: str) -> list[Decimal]:
    match = re.search(r"Вихід готової\s+страви,?\s*г\s+(.+)", text)
    if not match:
        match = re.search(r"Вихід готової\s+(.+)", text)
    if not match:
        return []
    tail = match.group(1).splitlines()[0]
    raw_tokens = tail.split()
    merged: list[str] = []
    i = 0
    while i < len(raw_tokens):
        tok = raw_tokens[i].split("/")[0]
        if (
            i + 1 < len(raw_tokens)
            and re.fullmatch(r"\d", tok)
            and re.fullmatch(r"\d{2}", raw_tokens[i + 1].split("/")[0])
        ):
            merged.append(tok + raw_tokens[i + 1].split("/")[0])
            i += 2
            continue
        merged.append(tok)
        i += 1
    outputs: list[Decimal] = []
    for token in merged:
        value = coerce_decimal(token)
        if value is not None:
            outputs.append(value)
    return outputs[1:] if outputs else []


def extract_nutrition(text: str) -> dict[str, dict[str, Decimal | None]]:
    header_re = re.compile(
        r"ХАРЧОВА.*?ЦІННІСТЬ.*?(?:КАЛОРІЙНІСТЬ)?\s*1\s*ПОРЦІЙ\s*"
        r"Маса порції,?\s*г\s+Білки,?\s*г\s+Жири,?\s*г\s+Вуглеводи,?\s*г\s+"
        r"Енергетична цінність,?\s*ккал\s*\n?(.*)",
        re.DOTALL | re.IGNORECASE,
    )
    match = header_re.search(text)
    if not match:
        return {}
    body = match.group(1)
    result: dict[str, dict[str, Decimal | None]] = {}
    for line in body.splitlines():
        tokens = line.split()
        if len(tokens) < 5:
            continue
        portion = coerce_decimal(tokens[0])
        if portion is None:
            continue
        if not all(is_number(tok) or is_dash(tok) for tok in tokens[1:5]):
            continue
        result[str(portion)] = {
            "kcal": coerce_decimal(tokens[4]),
            "proteins": coerce_decimal(tokens[1]),
            "fats": coerce_decimal(tokens[2]),
            "carbs": coerce_decimal(tokens[3]),
        }
    return result


def _clean_paragraph(text: str) -> str | None:
    paragraphs = re.split(r"\n\s*\n", text)
    cleaned = []
    for paragraph in paragraphs:
        line = " ".join(part.strip() for part in paragraph.splitlines() if part.strip())
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            cleaned.append(line)
    return " ".join(cleaned).strip() or None


# ---------------------------------------------------------------------------
# Ingredient table parsing
# ---------------------------------------------------------------------------


class ParsedAmount:
    __slots__ = ("name_snapshot", "gross", "net", "is_alternative", "notes")

    def __init__(self, name_snapshot, gross, net, is_alternative, notes=None):
        self.name_snapshot = name_snapshot
        self.gross = gross
        self.net = net
        self.is_alternative = is_alternative
        self.notes = notes


def extract_ingredient_table(
    text: str, portion_count: int
) -> tuple[list[ParsedAmount], list[str]]:
    start_match = re.search(r"Норма вмісту на 1 порцію", text)
    end_match = re.search(r"Вихід готової\s+страви", text)
    if not end_match:
        end_match = re.search(r"Вихід готової", text)
    if not start_match or not end_match:
        return [], []
    block = text[start_match.end() : end_match.start()]
    warnings: list[str] = []

    block = re.sub(r"брутто,?\s*г", " ", block)
    block = re.sub(r"нетто,?\s*г", " ", block)
    block = re.sub(r"Маса,?\s*г", " ", block)
    block = re.sub(r"№\s*з/п", " ", block)
    block = re.sub(r"Найменування\s+сировини", " ", block)
    block = re.sub(r"(?m)^[,\s]*г[,\s]*$", " ", block)

    raw_lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    expected_numbers = 2 + 2 * portion_count
    glued: list[str] = []
    current = ""

    def _count_numbers(text_: str) -> int:
        return sum(1 for tok in text_.split() if is_number(tok) or is_dash(tok))

    def _starts_new_row(line: str) -> bool:
        tokens = line.split()
        if not tokens:
            return False
        if tokens[0].lower() == "або":
            return True
        if not re.match(r"^\d+$", tokens[0]):
            return False
        if len(tokens) == 1:
            return True
        return not (is_number(tokens[1]) or is_dash(tokens[1]))

    for line in raw_lines:
        if _starts_new_row(line):
            if current:
                glued.append(current)
            current = line
        elif current:
            current = f"{current} {line}"
            if _count_numbers(current) >= expected_numbers:
                glued.append(current)
                current = ""
    if current:
        glued.append(current)

    amounts: list[ParsedAmount] = []
    for line in glued:
        parsed = _parse_ingredient_line(line, portion_count, warnings)
        if parsed is not None:
            amounts.append(parsed)
    return amounts, warnings


def _restore_name(line: str, is_alt: bool) -> str:
    raw = line
    if is_alt:
        raw = re.sub(r"^\s*або\s+", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"^\s*\d+\s+", "", raw)
    raw = SUBRECIPE_TOKEN.sub("", raw)
    raw = re.sub(r"\b№\s*\d+(?:[.,]\d+)*\b", "", raw)
    tokens = raw.split()
    name_parts: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if is_number(tok) and not _is_date_or_subrecipe(tok, tokens, i):
            break
        name_parts.append(tok)
        i += 1
    name = " ".join(name_parts).strip()
    name = re.sub(r"\s*[-–—]+\s*$", "", name).strip()
    return name


def _is_date_or_subrecipe(token: str, tokens: list[str], index: int) -> bool:
    if re.fullmatch(r"\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?", token):
        return True
    if index > 0 and tokens[index - 1] in {"№", "No"}:
        return True
    return False


def _parse_ingredient_line(
    line: str, portion_count: int, warnings: list[str]
) -> ParsedAmount | None:
    clean_line = DATE_TOKEN.sub("", line)
    clean_line = SUBRECIPE_TOKEN.sub("", clean_line)
    clean_line = re.sub(r"\s+", " ", clean_line).strip()

    tokens = clean_line.split()
    if not tokens:
        return None

    is_alt = tokens[0].lower() == "або"
    if is_alt:
        tokens = tokens[1:]
    if tokens and re.match(r"^\d+$", tokens[0]):
        tokens = tokens[1:]

    split_index = len(tokens)
    for i in range(len(tokens) - 1, -1, -1):
        if is_number(tokens[i]) or is_dash(tokens[i]):
            split_index = i
        else:
            break
    name_tokens = tokens[:split_index]
    number_tokens = tokens[split_index:]
    if not name_tokens:
        return None

    name_snapshot = _restore_name(line, is_alt)
    name_snapshot = ALLERGEN_PARENS.sub("", name_snapshot).strip()

    expected = 2 + 2 * portion_count
    if len(number_tokens) < expected:
        missing = expected - len(number_tokens)
        number_tokens = [None] * missing + number_tokens  # type: ignore[list-item]
    elif len(number_tokens) > expected:
        number_tokens = number_tokens[:expected]

    per_portion = number_tokens[2:]
    gross: list[Decimal | None] = []
    net: list[Decimal | None] = []
    for i in range(0, len(per_portion), 2):
        gross.append(coerce_decimal(per_portion[i]) if i < len(per_portion) else None)
        net.append(
            coerce_decimal(per_portion[i + 1]) if i + 1 < len(per_portion) else None
        )

    notes = None
    if any(g is None for g in gross):
        if all(n is not None for n in net) and net:
            notes = "У вихідній PDF gross позначено як '-'; використано net."
            gross = [n for n in net]
        else:
            warnings.append(
                f"Інгредієнт '{name_snapshot}' має порожні gross/net — перевірити вручну."
            )

    if all(g is None and n is None for g, n in zip(gross, net, strict=False)):
        warnings.append(f"Інгредієнт '{name_snapshot}' без значень gross/net.")
        return None

    return ParsedAmount(
        name_snapshot=name_snapshot,
        gross=gross,
        net=net,
        is_alternative=is_alt,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Building a card definition
# ---------------------------------------------------------------------------


def build_card_payload(
    card_number: str,
    name: str,
    pages: list[str],
) -> dict | None:
    text = "\n".join(pages)
    portion_outputs = extract_portion_outputs(text)
    if not portion_outputs:
        return None
    portion_count = len(portion_outputs)
    amounts, warnings = extract_ingredient_table(text, portion_count)
    if not amounts:
        return None

    nutrition_by_portion = extract_nutrition(text)
    allergen_codes = extract_allergen_codes(text)
    technology = extract_technology(text)
    category = extract_category(text)

    # Group alternatives.
    groups: list[list[ParsedAmount]] = []
    for amount in amounts:
        if amount.is_alternative and groups:
            groups[-1].append(amount)
        else:
            groups.append([amount])

    used_keys: set[str] = set()
    ingredient_amounts: list[dict] = []
    for group in groups:
        group_key = None
        if len(group) > 1:
            group_key = f"grp-{_slug(group[0].name_snapshot)}"
            while group_key in used_keys:
                group_key = f"{group_key}-{len(used_keys)}"
            used_keys.add(group_key)
        for index, amount in enumerate(group):
            alt_label = f"option-{index + 1}" if group_key else None
            for portion_index, output in enumerate(portion_outputs):
                gross = amount.gross[portion_index] if portion_index < len(amount.gross) else None
                net = amount.net[portion_index] if portion_index < len(amount.net) else None
                if gross is None or net is None:
                    warnings.append(
                        f"Інгредієнт '{amount.name_snapshot}', порція {output}: порожнє gross/net."
                    )
                    continue
                ingredient_amounts.append(
                    {
                        "name_snapshot": amount.name_snapshot,
                        "group_key": group_key,
                        "alternative_label": alt_label,
                        "output_grams": str(output),
                        "gross": str(gross),
                        "net": str(net),
                        "notes": amount.notes,
                    }
                )

    # Merge per-portion entries with same name+group+alt.
    merged: dict[tuple, dict] = {}
    for entry in ingredient_amounts:
        key = (entry["name_snapshot"], entry["group_key"], entry["alternative_label"])
        if key not in merged:
            merged[key] = {
                "name_snapshot": entry["name_snapshot"],
                "group_key": entry["group_key"],
                "alternative_label": entry["alternative_label"],
                "amounts_by_output": {},
                "notes": entry["notes"],
            }
        merged[key]["amounts_by_output"][entry["output_grams"]] = [entry["gross"], entry["net"]]
        if entry["notes"] and not merged[key]["notes"]:
            merged[key]["notes"] = entry["notes"]

    portions: list[dict] = []
    for output in portion_outputs:
        nutrition = nutrition_by_portion.get(str(output), {})
        portions.append(
            {
                "output_grams": str(output),
                "kcal": nutrition.get("kcal"),
                "proteins": nutrition.get("proteins"),
                "fats": nutrition.get("fats"),
                "carbs": nutrition.get("carbs"),
            }
        )

    return {
        "card_number": card_number,
        "name": name,
        "category": category,
        "technology_text": technology,
        "allergen_codes": allergen_codes,
        "portions": portions,
        "ingredient_amounts": list(merged.values()),
        "recognized_warnings": warnings,
    }


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zа-яіїє0-9]+", "-", value.lower()).strip("-")
    return slug or "ingredient"


# ---------------------------------------------------------------------------
# Seeding via service layer
# ---------------------------------------------------------------------------


def _ingredient_matches(item: Ingredient, name: str, unit: str) -> bool:
    return (
        normalize_lookup_text(item.name) == normalize_lookup_text(name)
        and item.unit.lower() == unit.lower()
    )


async def _find_ingredient(name: str, unit: str) -> Ingredient | None:
    existing, _ = await list_ingredients(
        offset=0, limit=100, query=name, include_inactive=True
    )
    for item in existing:
        if _ingredient_matches(item, name, unit):
            return item
    return None


async def ensure_ingredient(
    name: str, unit: str, cache: dict[str, PydanticObjectId]
) -> Ingredient:
    key = f"{normalize_lookup_text(name)}|{unit.lower()}"
    if key in cache:
        return await Ingredient.get(cache[key])
    existing = await _find_ingredient(name, unit)
    if existing is not None:
        cache[key] = existing.id
        return existing
    try:
        ingredient = await create_ingredient(
            CreateIngredientRequest(name=name, unit=unit, aliases=[])
        )
    except RecipeConflictError:
        existing = await _find_ingredient(name, unit)
        if existing is not None:
            cache[key] = existing.id
            return existing
        raise
    cache[key] = ingredient.id
    return ingredient


async def ensure_allergen(code: str, cache: dict[str, PydanticObjectId]) -> Allergen | None:
    normalized = code.strip().upper()
    if normalized in cache:
        return await Allergen.get(cache[normalized])
    existing_list, _ = await list_allergens(offset=0, limit=100, query=normalized)
    for item in existing_list:
        if item.code.upper() == normalized:
            cache[normalized] = item.id
            return item
    label = KNOWN_ALLERGEN_LABELS.get(normalized, f"Алерген {normalized}")
    try:
        allergen = await create_allergen(
            CreateAllergenRequest(code=normalized, name=label, description=None)
        )
    except RecipeConflictError:
        existing_list, _ = await list_allergens(offset=0, limit=100, query=normalized)
        for item in existing_list:
            if item.code.upper() == normalized:
                cache[normalized] = item.id
                return item
        return None
    cache[normalized] = allergen.id
    return allergen


async def import_card(
    payload: dict,
    ingredient_cache: dict[str, PydanticObjectId],
    allergen_cache: dict[str, PydanticObjectId],
    *,
    dry_run: bool,
) -> dict:
    card_number = payload["card_number"]
    report: dict = {
        "card_number": card_number,
        "name": payload["name"],
        "portions": len(payload["portions"]),
        "ingredients": len(payload["ingredient_amounts"]),
        "warnings": list(payload["recognized_warnings"]),
        "status": "pending",
        "errors": [],
    }

    if dry_run:
        report["status"] = "dry-run"
        return report

    try:
        # Resolve allergen ids.
        allergen_ids: list[PydanticObjectId] = []
        for code in payload["allergen_codes"]:
            allergen = await ensure_allergen(code, allergen_cache)
            if allergen is not None:
                allergen_ids.append(allergen.id)

        # Build portion variant payloads with stable ids.
        portion_variants: list[PortionVariantPayload] = []
        portion_ids_by_output: dict[str, PydanticObjectId] = {}
        for portion in payload["portions"]:
            variant_id = PydanticObjectId()
            portion_variants.append(
                PortionVariantPayload(
                    id=variant_id,
                    age_group=None,
                    portion_grams=Decimal(portion["output_grams"]),
                    output_grams=Decimal(portion["output_grams"]),
                    nutrition=NutritionPayload(
                        kcal=portion["kcal"],
                        proteins=portion["proteins"],
                        fats=portion["fats"],
                        carbs=portion["carbs"],
                    ),
                )
            )
            portion_ids_by_output[portion["output_grams"]] = variant_id

        ingredient_amounts: list[IngredientAmountPayload] = []
        for entry in payload["ingredient_amounts"]:
            ingredient = await ensure_ingredient(entry["name_snapshot"], "g", ingredient_cache)
            for output_grams, (gross, net) in entry["amounts_by_output"].items():
                ingredient_amounts.append(
                    IngredientAmountPayload(
                        ingredient_id=ingredient.id,
                        ingredient_name_snapshot=entry["name_snapshot"],
                        group_key=entry["group_key"],
                        alternative_label=entry["alternative_label"],
                        gross_amount=Decimal(gross),
                        net_amount=Decimal(net),
                        unit="g",
                        portion_variant_id=portion_ids_by_output[output_grams],
                        notes=entry["notes"],
                    )
                )

        # Create dish card (skip if exists).
        existing_cards = await DishCard.find({"card_number": card_number}).to_list()
        if existing_cards:
            dish_card = existing_cards[0]
        else:
            dish_card = await create_dish_card(
                CreateDishCardRequest(
                    card_number=card_number,
                    name=payload["name"],
                    category=payload["category"],
                    source="ТК до весняного меню Гатне",
                )
            )

        version = await create_dish_card_version(
            dish_card.id,
            CreateDishCardVersionRequest(
                technology_text=payload["technology_text"],
                allergen_ids=allergen_ids,
                portion_variants=portion_variants,
                ingredient_amounts=ingredient_amounts,
            ),
            created_by=None,
        )

        validation = await validate_dish_card_version(version.id)
        report["blocking"] = len(validation.blocking_errors)
        report["validation_warnings"] = len(validation.warnings)
        if validation.blocking_errors:
            report["status"] = "blocked"
            report["errors"] = [f"{e.code}: {e.message}" for e in validation.blocking_errors[:5]]
            return report

        confirmed = await confirm_dish_card_version(version.id)
        report["status"] = "confirmed"
        report["version_id"] = str(confirmed.id)
        return report
    except Exception as exc:  # noqa: BLE001
        report["status"] = "error"
        report["errors"].append(f"{type(exc).__name__}: {exc}")
        return report


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def parse_pdf(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    cards = split_cards(pages)
    payloads: list[dict] = []
    for card_number, name, card_pages in cards:
        payload = build_card_payload(card_number, name, card_pages)
        if payload is not None:
            payloads.append(payload)
    return payloads


async def main_async(pdf_paths: list[Path], dry_run: bool) -> int:
    await connect_mongo()
    try:
        await init_odm()
        all_payloads: list[dict] = []
        for pdf_path in pdf_paths:
            payloads = parse_pdf(pdf_path)
            print(f"{pdf_path.name}: parsed {len(payloads)} cards", file=sys.stderr)
            all_payloads.extend(payloads)

        ingredient_cache: dict[str, PydanticObjectId] = {}
        allergen_cache: dict[str, PydanticObjectId] = {}
        reports: list[dict] = []
        for payload in all_payloads:
            report = await import_card(
                payload, ingredient_cache, allergen_cache, dry_run=dry_run
            )
            reports.append(report)
            status_icon = {
                "confirmed": "✓",
                "blocked": "✗",
                "error": "!",
                "dry-run": "·",
                "pending": " ",
            }.get(report["status"], "?")
            print(
                f"  {status_icon} {report['card_number']:>8}  {report['name'][:45]:45s}  "
                f"portions={report['portions']} ing={report['ingredients']} -> {report['status']}",
                file=sys.stderr,
            )
            if report["errors"]:
                for err in report["errors"][:3]:
                    print(f"      ! {err}", file=sys.stderr)

        confirmed = sum(1 for r in reports if r["status"] == "confirmed")
        blocked = sum(1 for r in reports if r["status"] == "blocked")
        errors = sum(1 for r in reports if r["status"] == "error")
        print(
            f"\nSummary: {confirmed} confirmed, {blocked} blocked, {errors} errors, "
            f"{len(reports)} total",
            file=sys.stderr,
        )
        return 0 if errors == 0 and blocked == 0 else 1
    finally:
        await close_mongo()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", nargs="+", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(main_async(args.pdf, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
