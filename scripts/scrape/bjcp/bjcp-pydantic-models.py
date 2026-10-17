from pydantic import BaseModel
from typing import List, Optional

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
    comments: Optional[str] = None
    history: Optional[str] = None
    characteristic_ingredients: Optional[str] = None
    style_comparison: Optional[str] = None
    vital_statistics: VitalStatistics
    commercial_examples: List[str]
    style_attributes: List[str]
