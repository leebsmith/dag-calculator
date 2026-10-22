import pytest

from app.core.water import (
    GrainEntry,
    SaltDose,
    SolverValidationError,
    WaterChemistryInput,
    acid_required_meq_l,
    acid_volume_ml,
    add_ions,
    alkaline_agent_mass_g,
    bicarbonate_from_alkalinity,
    ions_added_ppm,
    mash_ph_status,
    predict_mash_ph,
    residual_alkalinity,
    resolve_grist,
    solve_salt_dose,
    solve_water_chemistry,
)


def _ions(**overrides):
    base = {"ca": 0.0, "mg": 0.0, "na": 0.0, "so4": 0.0, "cl": 0.0, "alk": 0.0}
    base.update(overrides)
    return base


# --- Residual alkalinity (Kolbach) -----------------------------------------


def test_residual_alkalinity_ward_labs():
    # Ward Labs: Ca 21.5, Mg 5, alkalinity 78 -> ~59.7 ppm (plan §3.1).
    ra = residual_alkalinity(21.5, 5.0, 78.0)
    assert ra == pytest.approx(59.70, abs=0.05)


def test_bicarbonate_from_alkalinity():
    assert bicarbonate_from_alkalinity(78.0) == pytest.approx(95.16, abs=0.01)


# --- Grist ------------------------------------------------------------------


def test_resolve_grist_base_malt():
    acidity, buckets = resolve_grist(
        [GrainEntry(mass_kg=5.0, color_lovibond=2.0, grain_type="BASE")]
    )
    assert acidity == pytest.approx(5.0 * 0.6174 * 2.0)
    assert buckets["BASE"] == pytest.approx(5.0)


def test_resolve_grist_unknown_type_raises():
    with pytest.raises(SolverValidationError):
        resolve_grist([GrainEntry(1.0, 2.0, "MYSTERY")])


def test_resolve_grist_buckets_sum():
    _, buckets = resolve_grist(
        [
            GrainEntry(4.0, 2.0, "BASE"),
            GrainEntry(0.5, 60.0, "ROASTED"),
            GrainEntry(0.2, 3.0, "ACID"),
        ]
    )
    assert sum(buckets.values()) == pytest.approx(4.7)


# --- Mash pH ----------------------------------------------------------------


def test_mash_ph_status_thresholds():
    assert mash_ph_status(5.4) == "OPTIMAL"
    assert mash_ph_status(5.0) == "LOW"
    assert mash_ph_status(6.1) == "HIGH"


def test_predict_mash_ph_reasonable():
    # A typical grist should land in a plausible mash pH band.
    ph = predict_mash_ph(
        grist_acidity_meq=20.0, ra_ppm=0.0, v_mash_treat_l=15.0, mash_thickness_l_per_kg=3.0
    )
    assert 4.0 < ph < 6.5


def test_predict_mash_ph_invalid_volume_raises():
    with pytest.raises(SolverValidationError):
        predict_mash_ph(20.0, 0.0, 0.0, 3.0)


# --- Acid -------------------------------------------------------------------


def test_acid_volume_positive_and_monotonic():
    low = acid_volume_ml(10.0, "LACTIC_88", 5.4)
    high = acid_volume_ml(20.0, "LACTIC_88", 5.4)
    assert low > 0
    assert high == pytest.approx(2 * low)


def test_acid_required_more_for_higher_start_ph():
    assert acid_required_meq_l(78.0, 6.2, 5.4) > acid_required_meq_l(78.0, 5.8, 5.4)


def test_alkaline_agent_mass():
    assert alkaline_agent_mass_g(10.0, "PICKLING_LIME") == pytest.approx(0.37)


# --- Salt dosing ------------------------------------------------------------


def test_ions_added_ppm_gypsum():
    added = ions_added_ppm(SaltDose(gypsum_g_per_l=1.0), "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    assert added["ca"] == pytest.approx(232.8)
    assert added["so4"] == pytest.approx(557.9)


def test_add_ions_sums():
    merged = add_ions(_ions(ca=10.0), _ions(ca=5.0, so4=20.0))
    assert merged["ca"] == pytest.approx(15.0)
    assert merged["so4"] == pytest.approx(20.0)


def test_tier1_flavor_closed_form():
    dose, notes, _strat = solve_salt_dose(
        "FLAVOR", _ions(so4=9.0, cl=3.0), _ions(so4=100.0, cl=60.0),
        "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0,
    )
    assert dose.gypsum_g_per_l == pytest.approx((100.0 - 9.0) / 557.9)
    assert dose.cacl2_g_per_l == pytest.approx((60.0 - 3.0) / 482.3)
    assert dose.epsom_g_per_l == 0.0
    assert not notes


def test_tier2_calcium_floor_hits_target_ions():
    source = _ions(ca=21.5, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=78.0)
    target = _ions(ca=50.0, mg=5.0, na=10.0, so4=100.0, cl=60.0)
    dose, _, _ = solve_salt_dose(
        "CALCIUM_FLOOR", source, target, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0
    )
    added = ions_added_ppm(dose, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    assert source["so4"] + added["so4"] == pytest.approx(100.0, abs=1e-4)
    assert source["cl"] + added["cl"] == pytest.approx(60.0, abs=1e-4)


def test_tier2_flavor_first_for_soft_source():
    # Below the floor: flavor salts are used as-is (calcium may overshoot).
    source = _ions(ca=21.5, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=78.0)
    target = _ions(ca=50.0, mg=5.0, na=10.0, so4=100.0, cl=60.0)
    dose, _, _ = solve_salt_dose(
        "CALCIUM_FLOOR", source, target, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0
    )
    assert dose.gypsum_g_per_l > 0
    assert dose.cacl2_g_per_l > 0
    assert dose.epsom_g_per_l == 0
    assert dose.nacl_g_per_l == 0


def test_tier2_caps_added_calcium_for_hard_source():
    # Above the floor: no calcium is added; sulfate/chloride go to Epsom/NaCl.
    source = _ions(ca=120.0, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=78.0)
    target = _ions(ca=50.0, mg=5.0, na=10.0, so4=100.0, cl=60.0)
    dose, _, _ = solve_salt_dose(
        "CALCIUM_FLOOR", source, target, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0
    )
    added = ions_added_ppm(dose, "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE")
    assert added["ca"] < 1e-6
    assert source["so4"] + added["so4"] == pytest.approx(100.0, abs=1e-4)


def test_tier3_optimize_returns_a_clone_dose():
    dose, _notes, strat = solve_salt_dose(
        "OPTIMIZE", _ions(ca=10.0, mg=2.0, na=8.0, so4=5.0, cl=7.0, alk=40.0),
        _ions(ca=80.0, mg=5.0, na=20.0, so4=100.0, cl=50.0, alk=0.0),
        "GYPSUM_DIHYDRATE", "CACL2_DIHYDRATE", 50.0,
    )
    assert strat == "OPTIMIZE"
    assert dose.gypsum_g_per_l >= 0.0


# --- Orchestration ----------------------------------------------------------


def _request(**overrides):
    base = dict(
        grist=[GrainEntry(5.0, 3.0, "BASE")],
        source=_ions(ca=21.5, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=78.0),
        target=_ions(ca=50.0, mg=5.0, na=10.0, so4=100.0, cl=60.0),
        v_mash_treat_l=15.0,
        v_hlt_treat_l=20.0,
        v_hlt_debt_l=1.0,
        v_sparge_demand_l=18.0,
        mash_thickness_l_per_kg=3.0,
        target_mash_ph=5.4,
        strategy="CALCIUM_FLOOR",
    )
    base.update(overrides)
    return WaterChemistryInput(**base)


def test_orchestration_proportional_scales_with_volume():
    out = solve_water_chemistry(_request(salt_distribution="PROPORTIONAL"))
    # Sparge dose = mash dose * (v_hlt / v_mash).
    assert out.sparge_dose_g["gypsum_g"] == pytest.approx(
        out.mash_dose_g["gypsum_g"] * (20.0 / 15.0)
    )
    assert out.strategy == "CALCIUM_FLOOR"


def test_orchestration_mash_only_leaves_sparge_unsalted():
    out = solve_water_chemistry(_request(salt_distribution="MASH_ONLY"))
    assert out.sparge_dose_g == {"gypsum_g": 0.0, "cacl2_g": 0.0, "epsom_g": 0.0, "nacl_g": 0.0}


def test_orchestration_sparge_tannin_warning_on_alkaline_source():
    out = solve_water_chemistry(_request())
    assert out.sparge_tannin_warning is True
    assert out.sparge_acid_ml > 0


def test_orchestration_ro_bypasses_sparge_acid():
    out = solve_water_chemistry(_request(source=_ions()))
    assert out.sparge_acid_ml == 0.0
    assert out.sparge_tannin_warning is False


def test_orchestration_residual_hlt_water():
    out = solve_water_chemistry(_request(v_hlt_treat_l=20.0, v_sparge_demand_l=18.0))
    assert out.residual_hlt_water_l == pytest.approx(2.0)


def test_hybrid_supplies_alkalinity_buffer():
    out = solve_water_chemistry(_request(
        strategy="HYBRID",
        source=_ions(ca=20.0, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=0.0),
        target=_ions(so4=50.0, cl=120.0, alk=60.0),
    ))
    assert out.alkaline_agent_g > 0.0
    assert out.post_salt_mash_ions["alk"] == pytest.approx(60.0, abs=0.5)


def test_cloner_reaches_alkalinity_with_the_agent():
    out = solve_water_chemistry(_request(
        strategy="OPTIMIZE",
        source=_ions(ca=20.0, mg=5.0, na=10.0, so4=9.0, cl=3.0, alk=0.0),
        target=_ions(ca=60.0, mg=5.0, na=10.0, so4=100.0, cl=50.0, alk=60.0),
    ))
    assert out.alkaline_agent_g > 0.0
    assert abs(out.post_salt_mash_ions["alk"] - 60.0) < 8.0
