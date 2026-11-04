"""BeerXML reader: a deterministic adapter into the same payload the LLM fills.

BeerXML is a published schema, not a document to interpret, so there is nothing
for a model to read. Parsing is exact, free, offline and reproducible — and the
interesting part of import (deciding what becomes a bill part, a boil hop, a
whirlpool hop) is the ledger's job for every format, not the reader's.

Two things the format cannot say, and this module refuses to invent:

- **A whirlpool stage does not exist.** ``USE`` is Boil / Dry Hop / Mash / First
  Wort / Aroma, so a whirlpool charge is usually a Boil hop at zero minutes or an
  Aroma hop. Those are *proposed* into the whirlpool pool; the split stays the
  user's authored number.
- **A dry hop has a duration but no start.** ``TIME`` is minutes (10080 is a
  week), so it becomes ``duration_min``; when it began is simply not in the file.

The file's own vagaries are disclosed rather than smoothed: ``AMOUNT_IS_WEIGHT``
is frequently absent, and a file that omits it may mean percentages while listing
kilograms.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from app.schemas.recipe_import import (
    DetectedRecipe,
    DocumentType,
    ExtractionPayload,
    FermentableKind,
    FermentableLine,
    HopLine,
    HopStage,
    MashLine,
    Provenance,
    Quantity,
    QuantityForm,
    Targets,
    UnmodeledLine,
    WarningLine,
    YeastLine,
)
from app.services.recipe_import import AmbiguousDocument

SUPPORTED_ROOT = "RECIPES"
MASS_UNITS = ("kg", "g")

# BeerXML's fermentable TYPE vocabulary, mapped to the payload's descriptive hint.
KIND_BY_TYPE = {
    "grain": FermentableKind.MALT,
    "sugar": FermentableKind.SUGAR,
    "extract": FermentableKind.EXTRACT,
    "dry extract": FermentableKind.EXTRACT,
    "adjunct": FermentableKind.ADJUNCT,
}


class BeerXmlError(Exception):
    """The file is not readable BeerXML."""


def looks_like_beerxml(data: bytes) -> bool:
    """Content sniffing, beside the PDF magic-byte check."""
    head = data.lstrip()[:400].lower()
    return b"<recipes" in data.lower() or b"<recipe>" in data.lower() or head.startswith(b"<?xml")


def parse(data: bytes) -> ExtractionPayload:
    """Read one recipe from a BeerXML document."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise BeerXmlError(f"not readable as XML: {exc}") from exc
    recipes = root.findall("RECIPE") if root.tag == SUPPORTED_ROOT else [root]
    if not recipes:
        raise BeerXmlError("no <RECIPE> element")
    if len(recipes) > 1:
        raise AmbiguousDocument([_text(recipe, "NAME") or "untitled" for recipe in recipes])
    return _payload(recipes[0])


def _payload(recipe: ET.Element) -> ExtractionPayload:
    warnings: list[WarningLine] = []
    fermentables = _fermentables(recipe, warnings)
    hops = _hops(recipe, warnings)
    return ExtractionPayload(
        document_type=DocumentType.RECIPE,
        quantity_form=_quantity_form(fermentables, hops),
        detected_recipes=[
            DetectedRecipe(title=_text(recipe, "NAME") or "Untitled recipe", pages=[1])
        ],
        title=_text(recipe, "NAME") or None,
        publication=_text(recipe, "BREWER") or None,
        style_name=_text(recipe, "STYLE/NAME") or None,
        targets=_targets(recipe, warnings),
        fermentables=fermentables,
        hops=hops,
        yeasts=_yeasts(recipe),
        mashes=_mashes(recipe),
        unmodeled=_unmodeled(recipe, warnings),
        warnings=warnings,
    )


# -----------------------------------------------------------------------------
# Ingredients
# -----------------------------------------------------------------------------

def _fermentables(recipe: ET.Element, warnings: list[WarningLine]) -> list[FermentableLine]:
    nodes = recipe.findall("./FERMENTABLES/FERMENTABLE")
    as_weights = _amounts_are_weights(nodes)
    if any(_text(node, "AMOUNT_IS_WEIGHT") is None for node in nodes) and as_weights:
        warnings.append(
            WarningLine(
                text=(
                    "AMOUNT_IS_WEIGHT is missing and the amounts are in the kilograms range, "
                    "so they were read as weights. BeerXML's default would make them percentages."
                )
            )
        )
    return [_fermentable(node, as_weights) for node in nodes]


def _amounts_are_weights(nodes: list[ET.Element]) -> bool:
    """Absent flags: weights when the numbers cannot be percentages."""
    if not nodes:
        return False
    flags = [(_text(node, "AMOUNT_IS_WEIGHT") or "").upper() for node in nodes]
    if any(flag == "TRUE" for flag in flags):
        return True
    amounts = [_number(node, "AMOUNT") for node in nodes]
    present = [value for value in amounts if value is not None]
    return any(value > 1 for value in present) or sum(present) > 1


def _fermentable(node: ET.Element, as_weights: bool) -> FermentableLine:
    amount = _number(node, "AMOUNT")
    return FermentableLine(
        name=_text(node, "NAME") or "Unnamed fermentable",
        maltster=_text(node, "SUPPLIER") or None,
        quantity=None if amount is None else Quantity(value=amount, unit="kg" if as_weights else "pct"),
        kind_hint=KIND_BY_TYPE.get((_text(node, "TYPE") or "").lower(), FermentableKind.UNKNOWN),
        verbatim=_line(node),
        page=1,
    )


def _hops(recipe: ET.Element, warnings: list[WarningLine]) -> list[HopLine]:
    nodes = recipe.findall("./HOPS/HOP")
    if any(_stage(node) == HopStage.WHIRLPOOL for node in nodes) and any(
        (_text(node, "USE") or "").lower() in ("boil", "aroma") for node in nodes
    ):
        warnings.append(
            WarningLine(
                text=(
                    "BeerXML has no whirlpool stage: zero-minute boil and Aroma charges are "
                    "proposed as whirlpool hops. Confirm the pool and the IBU split yourself."
                )
            )
        )
    return [hop for hop in (_hop(node) for node in nodes) if hop is not None]


def _hop(node: ET.Element) -> HopLine | None:
    stage = _stage(node)
    use = (_text(node, "USE") or "").lower()
    time = _number(node, "TIME")
    if use == "mash":
        return None
    return HopLine(
        name=_text(node, "NAME") or "Unnamed hop",
        quantity=_quantity(node),
        alpha_acid_pct=_number(node, "ALPHA"),
        stage_guess=stage,
        stage_verbatim=f"{_text(node, 'USE') or ''} {('' if time is None else int(time))}" .strip(),
        minutes=time if stage == HopStage.BOIL else None,
        duration_min=time if stage in (HopStage.WHIRLPOOL, HopStage.DRY_HOP) else None,
        product_form=(_text(node, "FORM") or "").lower().replace("pellet", "t90_pellet") or None,
        verbatim=_line(node),
        page=1,
    )


def _stage(node: ET.Element) -> HopStage:
    use = (_text(node, "USE") or "").lower()
    time = _number(node, "TIME")
    if use == "dry hop":
        return HopStage.DRY_HOP
    if use == "aroma":
        return HopStage.WHIRLPOOL
    if use == "boil" and time == 0:
        return HopStage.WHIRLPOOL
    if use in ("boil", "first wort"):
        return HopStage.BOIL
    return HopStage.UNKNOWN


def _quantity(node: ET.Element) -> Quantity | None:
    amount = _number(node, "AMOUNT")
    return None if amount is None else Quantity(value=amount, unit="kg")


# -----------------------------------------------------------------------------
# Yeast, mash, misc
# -----------------------------------------------------------------------------

def _yeasts(recipe: ET.Element) -> list[YeastLine]:
    return [
        YeastLine(
            name=_text(node, "NAME") or "Unnamed yeast",
            lab=_text(node, "LABORATORY") or None,
            code=_text(node, "PRODUCT_ID") or None,
            attenuation_pct=_number(node, "ATTENUATION"),
            verbatim=_line(node),
            page=1,
        )
        for node in recipe.findall("./YEASTS/YEAST")
    ]


def _mashes(recipe: ET.Element) -> list[MashLine]:
    return [
        MashLine(
            step_verbatim=_text(node, "NAME") or "Mash step",
            temperature=_temperature(node),
            duration_min=_number(node, "STEP_TIME"),
            page=1,
        )
        for node in recipe.findall("./MASH/MASH_STEPS/MASH_STEP")
    ]


def _temperature(node: ET.Element) -> Any:
    value = _number(node, "STEP_TEMP")
    if value is None:
        return None
    from app.schemas.recipe_import import Temperature

    return Temperature(value=value, unit="c")


def _unmodeled(recipe: ET.Element, warnings: list[WarningLine]) -> list[UnmodeledLine]:
    lines = [
        UnmodeledLine(
            text=f"{_text(node, 'NAME') or 'Misc'} {_text(node, 'AMOUNT') or ''} "
            f"{_text(node, 'AMOUNT_IS_WEIGHT') or ''} ({_text(node, 'USE') or ''})".strip(),
            page=1,
            kind="process_additive",
            stage=_text(node, "TIME") or None,
        )
        for node in recipe.findall("./MISCS/MISC")
    ]
    water = recipe.find("./WATERS/WATER")
    if water is not None:
        lines.append(UnmodeledLine(text=f"Water profile: {_water(water)}", page=1, kind="water_salt"))
    return lines


def _water(water: ET.Element) -> str:
    ions = ("CALCIUM", "MAGNESIUM", "SODIUM", "SULFATE", "CHLORIDE", "BICARBONATE")
    parts = [f"{ion.title()} {_text(water, ion)}" for ion in ions if _text(water, ion)]
    return ", ".join(parts) or "stated"


# -----------------------------------------------------------------------------
# Targets
# -----------------------------------------------------------------------------

def _targets(recipe: ET.Element, warnings: list[WarningLine]) -> Targets:
    values: dict[str, Any] = {}
    _put(values, "volume", _number(recipe, "BATCH_SIZE"), "l", "BATCH_SIZE")
    _put(values, "og", _number(recipe, "OG"), "sg", "OG")
    _put(values, "fg", _number(recipe, "FG"), "sg", "FG")
    _put(values, "abv", _number(recipe, "EST_ABV") or _number(recipe, "ABV"), "pct", "ABV")
    _put(values, "ibu", _number(recipe, "EST_IBU"), "ibu", "EST_IBU")
    _put(values, "srm", _number(recipe, "EST_COLOR"), "srm", "EST_COLOR")
    _put(values, "boil_time_min", _number(recipe, "BOIL_TIME"), "min", "BOIL_TIME")
    if values.get("ibu") is None:
        warnings.append(
            WarningLine(
                text=(
                    "This file states no IBU. The calculator solves hop masses from a bitterness "
                    "target, so the number has to be supplied; the file's hop charges are kept as "
                    "a record of what the brewer used."
                )
            )
        )
    return Targets.model_validate(values)


def _put(values: dict[str, Any], field: str, number: float | None, unit: str, label: str) -> None:
    if number is None:
        return
    values[field] = {
        "value": number,
        "unit": unit,
        "verbatim": f"{label} {number:g}",
        "page": 1,
        "source": Provenance.BEERXML.value,
    }


def _quantity_form(fermentables: list[FermentableLine], hops: list[HopLine]) -> QuantityForm:
    if any(line.quantity and line.quantity.unit == "pct" for line in fermentables):
        return QuantityForm.PERCENT
    if any(line.quantity for line in fermentables) or any(line.quantity for line in hops):
        return QuantityForm.MASS
    return QuantityForm.NONE


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _text(node: ET.Element, path: str) -> str | None:
    found = node.findtext(path)
    if found is None:
        return None
    value = found.strip()
    return value or None


def _number(node: ET.Element, path: str) -> float | None:
    raw = _text(node, path)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _line(node: ET.Element) -> str:
    """A one-line provenance string: the fields that identify the entry."""
    parts = [_text(node, tag) for tag in ("NAME", "AMOUNT", "USE", "TIME") if _text(node, tag)]
    return " · ".join(parts) or (node.tag.title() if node.tag else "")
