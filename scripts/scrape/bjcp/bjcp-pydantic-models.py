from pydantic import BaseModel


class VitalRange(BaseModel):
    min: float
    max: float

class VitalStatistics(BaseModel):
    ibu: VitalRange
    srm: VitalRange
    og: VitalRange
    fg: VitalRange
    abv: VitalRange

class BJCPStyleTarget(BaseModel):
    style_id: str
    style_name: str
    version: int
    overall_impression: str
    appearance: str
    aroma: str
    flavor: str
    mouthfeel: str
    comments: str | None = None
    history: str | None = None
    characteristic_ingredients: str | None = None
    style_comparison: str | None = None
    vital_statistics: VitalStatistics
    commercial_examples: list[str]
    style_attributes: list[str]
