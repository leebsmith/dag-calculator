"""The BeerXML adapter: a deterministic reader that discloses what the format cannot say."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.schemas.recipe_import import (
    DocumentType,
    HopStage,
    QuantityForm,
)
from app.services import beerxml

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "beerxml"


def read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


@pytest.fixture
def punk():
    return beerxml.parse(read("punk-ipa-2010-current.xml"))


@pytest.fixture
def rebel():
    return beerxml.parse(read("devine-rebel-w-mikkeller.xml"))


def test_the_document_is_a_recipe_with_mass_quantities(punk):
    assert punk.document_type == DocumentType.RECIPE
    assert punk.quantity_form == QuantityForm.MASS
    assert punk.detected_recipes[0].title.upper().startswith("PUNK IPA")


def test_targets_come_from_the_file(punk):
    assert punk.targets.volume.value == 20
    assert punk.targets.og.value == 1.053
    assert punk.targets.fg.value == 1.011
    assert punk.targets.boil_time_min.value == 60
    assert punk.targets.ibu is None, "BeerXML often omits EST_IBU"


def test_a_missing_ibu_is_warned_about_not_invented(punk):
    assert any("states no IBU" in warning.text for warning in punk.warnings)


def test_absent_amount_flags_are_read_as_weights_and_disclosed(punk):
    """BeerXML's default would make these percentages; the numbers say otherwise."""
    amounts = [line.quantity.value for line in punk.fermentables]
    assert amounts == [4.38, 0.25]
    assert all(line.quantity.unit == "kg" for line in punk.fermentables)
    assert any("AMOUNT_IS_WEIGHT is missing" in warning.text for warning in punk.warnings)


def test_hop_stages_survive_the_format(punk):
    stages = [hop.stage_guess for hop in punk.hops]
    assert stages.count(HopStage.BOIL) == 4, "60 and 30 minute charges"
    assert stages.count(HopStage.WHIRLPOOL) == 4, "0-minute boil charges are whirlpool proposals"
    assert stages.count(HopStage.DRY_HOP) == 6


def test_a_zero_minute_charge_is_never_left_in_the_boil(punk):
    for hop in punk.hops:
        if hop.stage_guess == HopStage.BOIL:
            assert hop.minutes and hop.minutes > 0


def test_a_dry_hop_has_a_duration_and_no_start(punk):
    dry = [hop for hop in punk.hops if hop.stage_guess == HopStage.DRY_HOP]
    assert [hop.duration_min for hop in dry] == [10080.0] * 6, "seven days, in minutes"
    assert all(hop.minutes is None for hop in dry)


def test_alpha_acid_and_form_come_through(punk):
    first = punk.hops[0]
    assert first.name == "Chinook"
    assert first.alpha_acid_pct == 12.6
    assert first.product_form == "t90_pellet"


def test_yeast_and_mash_are_read(punk):
    assert punk.yeasts[0].name.startswith("Wyeast 1056")
    step = punk.mashes[0]
    assert step.temperature.value == 66
    assert step.duration_min == 75


def test_a_second_file_reads_the_same_way(rebel):
    assert rebel.targets.og.value == 1.093
    assert [line.name for line in rebel.fermentables] == ["Extra Pale", "Caramalt", "Munich", "Amber"]
    assert all(line.quantity.unit == "kg" for line in rebel.fermentables)


def test_several_recipes_in_one_file_are_refused_not_narrowed():
    data = (
        b"<?xml version='1.0'?><RECIPES>"
        b"<RECIPE><NAME>One</NAME></RECIPE><RECIPE><NAME>Two</NAME></RECIPE></RECIPES>"
    )
    with pytest.raises(Exception) as caught:
        beerxml.parse(data)
    assert getattr(caught.value, "titles", None) == ["One", "Two"]


def test_broken_xml_is_a_payload_error():
    with pytest.raises(beerxml.BeerXmlError):
        beerxml.parse(b"<?xml version='1.0'?><RECIPES><RECIPE>")


def test_the_reader_is_sniffed_by_content(punk):
    assert beerxml.looks_like_beerxml(read("punk-ipa-2010-current.xml"))
    assert not beerxml.looks_like_beerxml(b"%PDF-1.4 ...")
