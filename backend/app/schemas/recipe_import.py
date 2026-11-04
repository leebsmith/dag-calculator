"""Pydantic contracts for PDF recipe extraction and registry matching.

Two LLM-facing shapes, both strict:

- ``ExtractionPayload`` — the transcription of one recipe document. It carries
  printed numbers in their printed units, never a converted or computed value,
  and never a registry id. ``ExtractedRecipe`` wraps it with the server's own
  provenance (file hash, model, prompt version), which the model must not
  produce.
- ``MatchRequest`` / ``MatchResponse`` — the bounded shortlist tie-break. A reply
  may only name ids the caller supplied; that subset rule is enforced in the
  service, where both sides are visible.

Neither shape carries authority: the extract proposes, the ledger decides.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

EXTRACTION_SCHEMA_VERSION = 1

REQUIRED_SCALARS = ("volume", "og", "ibu")


class StrictModel(BaseModel):
    """Base for wire contracts: unknown keys are a bug, not a default."""

    model_config = ConfigDict(extra="forbid", frozen=True)


# -----------------------------------------------------------------------------
# Vocabularies
# -----------------------------------------------------------------------------

class Unit(StrEnum):
    """Printed units the extraction may carry. Anything else is a rejection."""

    G = "g"
    KG = "kg"
    OZ = "oz"
    LB = "lb"
    ML = "ml"
    L = "l"
    TSP = "tsp"
    TBSP = "tbsp"
    CUP = "cup"
    QT = "qt"
    GAL = "gal"
    PCT = "pct"
    MIN = "min"
    H = "h"
    DAY = "day"


class TempUnit(StrEnum):
    """Temperature scale, kept as printed so nothing is silently converted."""

    C = "c"
    F = "f"


class VolumeUnit(StrEnum):
    """Units a stated volume may use."""

    L = "l"
    GAL = "gal"


class GravityUnit(StrEnum):
    """Units a stated gravity may use; the scale is part of the value.

    ``points`` is the brewing-software convention that writes 1.110 as ``1110``.
    It is a unit, not a normalisation: the ledger converts it, the extract does
    not.
    """

    SG = "sg"
    PLATO = "plato"
    POINTS = "points"


class ColourUnit(StrEnum):
    """Units a stated colour may use."""

    SRM = "srm"
    EBC = "ebc"


class PercentUnit(StrEnum):
    """The unit a stated ABV is written in."""

    PCT = "pct"


class IbuUnit(StrEnum):
    """The unit a stated bitterness is written in."""

    IBU = "ibu"


class MinutesUnit(StrEnum):
    """The unit a stated duration is written in."""

    MIN = "min"


class ThicknessUnit(StrEnum):
    """The unit a stated mash thickness is written in."""

    L_PER_KG = "l_per_kg"
    QT_PER_LB = "qt_per_lb"


class Provenance(StrEnum):
    """Who produced a value: the model's transcription or the reviewing user."""

    LLM = "llm"
    USER = "user"


class DocumentType(StrEnum):
    """What the document *is*, before any transcription of it.

    The label narrates; the evidence decides. A wrong ``spec_sheet`` must never
    be able to stop an importable recipe, so nothing branches on this alone.
    """

    RECIPE = "recipe"
    SPEC_SHEET = "spec_sheet"
    ARTICLE = "article"
    UNKNOWN = "unknown"


class QuantityForm(StrEnum):
    """The form the recipe's quantities take, so the map knows what to expect."""

    MASS = "mass"
    PERCENT = "percent"
    PROSE = "prose"
    NONE = "none"
    UNKNOWN = "unknown"


class HopStage(StrEnum):
    """The model's reading of a hop line's stage; a hint, never a decision."""

    BOIL = "boil"
    WHIRLPOOL = "whirlpool"
    DRY_HOP = "dry_hop"
    UNKNOWN = "unknown"


class FermentableKind(StrEnum):
    """A descriptive guess at a fermentable line's class; never a catalog kind."""

    MALT = "malt"
    SUGAR = "sugar"
    EXTRACT = "extract"
    ADJUNCT = "adjunct"
    UNKNOWN = "unknown"


class UnmodeledKind(StrEnum):
    """Where a line the model cannot place belongs, descriptively."""

    WATER_SALT = "water_salt"
    PROCESS_ADDITIVE = "process_additive"
    PACKAGING = "packaging"
    EQUIPMENT_NOTE = "equipment_note"
    EDITORIAL = "editorial"
    OTHER = "other"


class TargetName(StrEnum):
    """The scalars a gap-fill pass may be asked to recover."""

    VOLUME = "volume"
    OG = "og"
    FG = "fg"
    ABV = "abv"
    IBU = "ibu"
    SRM = "srm"
    BOIL_TIME_MIN = "boil_time_min"


class MatchKind(StrEnum):
    """The catalog family a match call is screening."""

    MALT = "malt"
    SUGAR = "sugar"
    HOP = "hop"
    YEAST = "yeast"


class MatchReason(StrEnum):
    """Why a candidate was proposed. A label for the chip, not prose."""

    NAME_SYNONYM = "name_synonym"
    SAME_STANDARD = "same_standard"
    SIMILAR_ATTENUATION = "similar_attenuation"
    SIMILAR_TEMPERATURE = "similar_temperature"
    UNKNOWN = "unknown"


# -----------------------------------------------------------------------------
# Primitives
# -----------------------------------------------------------------------------

class Quantity(StrictModel):
    """A printed amount. Deliberately not converted."""

    value: float = Field(ge=0)
    unit: Unit


class Temperature(StrictModel):
    """A printed temperature with its scale."""

    value: float
    unit: TempUnit = TempUnit.C


class Thickness(StrictModel):
    """A printed mash thickness with its unit; never converted here."""

    value: float = Field(gt=0)
    unit: ThicknessUnit


class StatedTarget(StrictModel):
    """A stated recipe target with the phrase it came from.

    The unit is declared per field below, so the wire schema only ever offers
    units that field can actually use.
    """

    value: float
    verbatim: str
    page: int = Field(ge=1)
    source: Provenance = Provenance.LLM


class VolumeTarget(StatedTarget):
    unit: VolumeUnit | None = None


class GravityTarget(StatedTarget):
    unit: GravityUnit | None = None

    @model_validator(mode="after")
    def _specific_gravity_is_a_fraction(self) -> GravityTarget:
        """An SG of 1110 is not a strong beer; it is points wearing the wrong unit."""
        if self.unit in (None, GravityUnit.SG) and self.value >= 100:
            raise ValueError(
                f"a specific gravity cannot be {self.value}; "
                "points notation (1110 for 1.110) belongs in the points unit"
            )
        return self


class ColourTarget(StatedTarget):
    unit: ColourUnit | None = None


class PercentTarget(StatedTarget):
    unit: PercentUnit | None = None


class IbuTarget(StatedTarget):
    unit: IbuUnit | None = None


class MinutesTarget(StatedTarget):
    unit: MinutesUnit | None = None


class Targets(StrictModel):
    """The recipe's stated scalars. Absence is absence, never zero."""

    volume: VolumeTarget | None = None
    og: GravityTarget | None = None
    fg: GravityTarget | None = None
    abv: PercentTarget | None = None
    ibu: IbuTarget | None = Field(
        default=None,
        description="Recipe bitterness target, including one stated in prose. Not a per-addition IBU.",
    )
    srm: ColourTarget | None = None
    boil_time_min: MinutesTarget | None = None


# -----------------------------------------------------------------------------
# Transcription rows
# -----------------------------------------------------------------------------

class FermentableLine(StrictModel):
    """One grist, sugar or extract line, exactly as printed."""

    name: str
    maltster: str | None = None
    quantity: Quantity | None = None
    kind_hint: FermentableKind = FermentableKind.UNKNOWN
    verbatim: str
    page: int = Field(ge=1)


class HopLine(StrictModel):
    """One hop line. Percentages are the printed percentages, not fractions."""

    name: str
    quantity: Quantity | None = None
    alpha_acid_pct: float | None = Field(default=None, ge=0, le=100)
    ibu_contribution: float | None = Field(
        default=None,
        ge=0,
        description="Per-addition IBU, only when the page attributes it to this line. Null for a recipe-level target.",
    )
    stage_verbatim: str | None = None
    stage_guess: HopStage = HopStage.UNKNOWN
    minutes: float | None = Field(default=None, ge=0)
    temperature: Temperature | None = None
    product_form: str | None = None
    verbatim: str
    page: int = Field(ge=1)


class YeastLine(StrictModel):
    """One yeast line: the page rarely names a lab, and often names no strain."""

    name: str
    lab: str | None = None
    code: str | None = None
    form: str | None = None
    attenuation_pct: float | None = Field(default=None, ge=0, le=100)
    temp_low: Temperature | None = None
    temp_high: Temperature | None = None
    verbatim: str
    page: int = Field(ge=1)


class MashLine(StrictModel):
    """One mash step as printed."""

    step_verbatim: str
    temperature: Temperature | None = None
    duration_min: float | None = Field(default=None, ge=0)
    thickness: Thickness | None = None
    page: int = Field(ge=1)


class PoolIbu(StrictModel):
    """Printed IBU subtotals, when the page states them separately."""

    boil: float | None = Field(default=None, ge=0)
    whirlpool: float | None = Field(default=None, ge=0)


class UnmodeledLine(StrictModel):
    """A captured line with no home in the model. Never silently dropped."""

    text: str
    page: int = Field(ge=1)
    kind: UnmodeledKind = UnmodeledKind.OTHER
    quantity: Quantity | None = None
    stage: str | None = None


class WarningLine(StrictModel):
    """A contradiction or ambiguity the model noticed while transcribing."""

    text: str
    page: int | None = None


class DetectedRecipe(StrictModel):
    """A recipe the model found in the document, used to reject ambiguous files."""

    title: str
    pages: list[int] = Field(min_length=1)


# -----------------------------------------------------------------------------
# Extraction
# -----------------------------------------------------------------------------

class ExtractionPayload(StrictModel):
    """What the model returns for one document. No registry, no arithmetic."""

    document_type: DocumentType = DocumentType.UNKNOWN
    quantity_form: QuantityForm = QuantityForm.UNKNOWN
    detected_recipes: list[DetectedRecipe] = []
    title: str | None = None
    publication: str | None = None
    style_name: str | None = None
    targets: Targets = Targets()
    fermentables: list[FermentableLine] = []
    hops: list[HopLine] = []
    yeasts: list[YeastLine] = []
    mashes: list[MashLine] = []
    pool_ibu: PoolIbu | None = None
    unmodeled: list[UnmodeledLine] = []
    warnings: list[WarningLine] = []

    def missing_scalars(self) -> list[str]:
        """Required targets the document did not state, in a stable order."""
        return [name for name in REQUIRED_SCALARS if getattr(self.targets, name) is None]


class GapFillRequest(StrictModel):
    """What the caller asks a re-read to recover. Never what it may overwrite."""

    missing: list[TargetName] = Field(min_length=1)
    title: str | None = None
    style_name: str | None = None
    page_hint: str | None = None


class GapFillPayload(StrictModel):
    """The re-read's answer: the same target shapes, absent where still absent."""

    targets: Targets = Targets()


class UnmatchedNumber(StrictModel):
    """A reported number that the page text does not contain."""

    field: str
    value: str
    page: int | None = None


class ExtractionVerification(StrictModel):
    """The mechanical check, when the document carried a text layer.

    ``text_layer: false`` means no check was possible (a scan), not that the
    extraction passed.
    """

    text_layer: bool
    pages: int | None = None
    numbers_checked: int = 0
    unmatched: list[UnmatchedNumber] = []


class SourceMeta(StrictModel):
    """Server-side provenance for one extraction. Never produced by the model."""

    filename: str
    sha256: str = Field(min_length=64, max_length=64)
    page_count: int | None = Field(default=None, ge=1)
    model: str | None = None
    prompt_id: str | None = None
    prompt_version: int | None = Field(default=None, ge=1)
    extractor: str = "llm"
    extracted_at: str


class ExtractedRecipe(StrictModel):
    """The stored transcription: the model's payload, our provenance, and the check."""

    schema_version: int = EXTRACTION_SCHEMA_VERSION
    source: SourceMeta
    payload: ExtractionPayload
    verification: ExtractionVerification | None = None


# -----------------------------------------------------------------------------
# Registry matching
# -----------------------------------------------------------------------------

class Candidate(StrictModel):
    """One screened candidate, with a prepared one-line detail for the model."""

    id: str
    name: str
    detail: str | None = None
    standard: str | None = None


class MatchItem(StrictModel):
    """One transcribed source line and the candidates the screen admitted."""

    text: str
    stage: str | None = None
    candidates: list[Candidate] = Field(min_length=1)


class MatchContext(StrictModel):
    """Compact recipe context so a kind's lines resolve consistently."""

    volume_l: float | None = None
    og: float | None = None
    ibu: float | None = None
    style_name: str | None = None


class MatchRequest(StrictModel):
    """The shortlists to tie-break. Seed-free: the client owns the catalogs."""

    kind: MatchKind
    context: MatchContext = MatchContext()
    items: list[MatchItem] = Field(min_length=1, max_length=25)


class Pick(StrictModel):
    """A proposed candidate id. Empty picks is a valid answer."""

    id: str
    reason: MatchReason = MatchReason.UNKNOWN


class MatchReply(StrictModel):
    """The model's proposals for one source line."""

    text: str
    picks: list[Pick] = Field(max_length=5)

    @model_validator(mode="after")
    def _unique_ids(self) -> MatchReply:
        ids = [pick.id for pick in self.picks]
        if len(ids) != len(set(ids)):
            raise ValueError("a reply may not repeat a candidate id")
        return self


class MatchResponse(StrictModel):
    """The model's proposals for every line it was given."""

    items: list[MatchReply]
