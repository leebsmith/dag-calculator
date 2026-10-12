import pytest
from app.core.utils import (
    sg_to_plato,
    plato_to_sg,
    calculate_abv_and_attenuation,
    invert_from_target_abv_and_attenuation,
    invert_from_oe_and_target_abv,
)


def test_sg_to_plato_water():
    # Pure water: SG 1.000 should be very close to 0 Plato
    plato = sg_to_plato(1.000)
    assert pytest.approx(plato, abs=0.01) == 0.0


def test_sg_to_plato_standard_wort():
    # SG 1.040 is roughly 10 Plato
    plato = sg_to_plato(1.040)
    assert pytest.approx(plato, abs=0.1) == 10.0


def test_sg_to_plato_invalid_sg():
    with pytest.raises(ValueError, match="Specific gravity must be positive."):
        sg_to_plato(0.0)
    with pytest.raises(ValueError, match="Specific gravity must be positive."):
        sg_to_plato(-1.0)


def test_plato_to_sg_water():
    # 0 Plato should be SG 1.000
    sg = plato_to_sg(0.0)
    assert pytest.approx(sg, abs=1e-4) == 1.0


def test_plato_to_sg_standard_wort():
    # 10 Plato is roughly SG 1.040
    sg = plato_to_sg(10.0)
    assert pytest.approx(sg, abs=0.001) == 1.040


def test_plato_to_sg_invalid_plato():
    with pytest.raises(ValueError, match="Degrees Plato cannot be negative."):
        plato_to_sg(-1.5)


def test_roundtrip_conversion():
    # Test roundtrip accuracy for a typical brewing gravity (e.g., 1.050 -> ~12.38 Plato -> ~1.050 SG)
    initial_sg = 1.050
    plato = sg_to_plato(initial_sg)
    recovered_sg = plato_to_sg(plato)
    assert pytest.approx(recovered_sg, abs=1e-3) == initial_sg


def test_calculate_abv_and_attenuation():
    # Standard 12°P original extract, 3°P apparent extract
    res = calculate_abv_and_attenuation(12.0, 3.0)
    assert res["oe_plato"] == 12.0
    assert res["ae_plato"] == 3.0
    assert pytest.approx(res["abv_pct"], abs=0.1) == 4.8
    assert pytest.approx(res["apparent_attenuation_pct"], abs=0.1) == 75.0


def test_calculate_abv_and_attenuation_invalid():
    with pytest.raises(ValueError):
        calculate_abv_and_attenuation(0.0, 0.0)
    with pytest.raises(ValueError):
        calculate_abv_and_attenuation(10.0, 12.0)


def test_invert_from_target_abv_and_attenuation():
    # Target 5.0% ABV, 75% attenuation
    res = invert_from_target_abv_and_attenuation(5.0, 75.0)
    assert pytest.approx(res["abv_pct"], abs=1e-3) == 5.0
    assert pytest.approx(res["apparent_attenuation_pct"], abs=1e-2) == 75.0


def test_invert_from_target_abv_and_attenuation_invalid():
    with pytest.raises(ValueError):
        invert_from_target_abv_and_attenuation(0.0, 75.0)
    with pytest.raises(ValueError):
        invert_from_target_abv_and_attenuation(5.0, 110.0)


def test_invert_from_oe_and_target_abv():
    # OE 12°P (~1.048 SG), target 5.0% ABV
    res = invert_from_oe_and_target_abv(12.0, 5.0)
    assert pytest.approx(res["oe_plato"], abs=1e-3) == 12.0
    assert pytest.approx(res["abv_pct"], abs=1e-3) == 5.0


def test_invert_from_oe_and_target_abv_invalid():
    with pytest.raises(ValueError):
        invert_from_oe_and_target_abv(0.0, 5.0)
    with pytest.raises(ValueError):
        # Target ABV impossible for given OE
        invert_from_oe_and_target_abv(5.0, 25.0)
