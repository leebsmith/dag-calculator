"""
Brewing calculation utility functions, including ASBC standard conversions
between Specific Gravity (SG) and degrees Plato, and advanced Cutaia et al. (2009)
fermentation solvers.
"""


from scipy.optimize import brentq


def plato_to_sg(plato: float) -> float:
    """Converts degrees Plato to Specific Gravity (20°C/20°C)

    using the official ASBC 3rd-order polynomial.

    Apparent extract may fall below 0 °P when a diastaticus-style fermentation
    consumes the dextrin residue (an apparent attenuation above 100 %), so the
    polynomial is evaluated on a negative domain. The floor is a guard for the
    regression's extrapolation, not a physical claim: at 40 °P with the residue
    fully consumed the inverted regression reaches about −14 °P.
    """
    if plato < -20.0:
        raise ValueError("Degrees Plato below -20 is outside the ASBC domain.")

    return (
        1.0000131
        + 0.00386777 * plato
        + 1.27447e-5 * (plato**2)
        + 6.34964e-8 * (plato**3)
    )


def sg_to_plato(sg: float) -> float:
    """Converts Specific Gravity (20°C/20°C) to degrees Plato

    using the ASBC Table 1 cubic polynomial.
    """
    if sg <= 0:
        raise ValueError("Specific gravity must be positive.")

    # Evaluated via Horner's method for numerical efficiency
    return ((135.997 * sg - 630.272) * sg + 1111.14) * sg - 616.868


# Cutaia et al. (2009) real-extract regression:
#   RE = a·ABW + b·AE − c·(ABW·AE) − d·AE²
CUTAIA_RE_ABW: float = 0.49681569
CUTAIA_RE_AE: float = 1.0015341
CUTAIA_RE_ABW_AE: float = 0.00059105
CUTAIA_RE_AE2: float = 0.00029431


def cutaia_abw(oe: float, ae: float) -> float:
    """Alcohol by weight (%) via Cutaia, Reid, & Speers (2009)."""
    return (0.372 + 0.00357 * oe) * (oe - ae)


def cutaia_real_extract(oe: float, ae: float) -> float:
    """Real extract (°P) from original/apparent extract via the Cutaia fit.

    This is the coefficient set the artifact calls ``cutaia_real_extract``; the
    JS and Python sides are pinned together by ``numeric-parity.json``.
    """
    abw = cutaia_abw(oe, ae)
    return (
        CUTAIA_RE_ABW * abw
        + CUTAIA_RE_AE * ae
        - CUTAIA_RE_ABW_AE * (abw * ae)
        - CUTAIA_RE_AE2 * (ae * ae)
    )


def apparent_to_real_attenuation(oe: float, apparent_attenuation: float) -> float:
    """Convert an apparent attenuation to the real attenuation at ``oe``.

    ``AE = OE·(1 − AA_app)`` then ``RDF = (OE − RE) / OE`` with ``RE`` from the
    Cutaia regression. Ingredient figures use the fixed 12 °P reference; the
    yeast cap converts per candidate ``OE``.

    Raises:
        ValueError: If ``oe`` is not positive or the attenuation is outside
            (0, 1].
    """
    if oe <= 0:
        raise ValueError("Original extract must be greater than 0.")
    if not (0.0 < apparent_attenuation <= 1.0):
        raise ValueError("Apparent attenuation must be in (0, 1].")

    ae = oe * (1.0 - apparent_attenuation)
    return (oe - cutaia_real_extract(oe, ae)) / oe


def apparent_extract_for_real_extract(oe: float, real_extract: float) -> float:
    """Invert the Cutaia regression: apparent extract for a given real extract.

    The regression is monotonic in ``AE``, so the root is unique. ``AE`` may be
    negative when the residual extract is small enough that only a beer with
    apparent extract below 0 °P can hold it (the dextrin-consumption regime).
    """
    if oe <= 0:
        raise ValueError("Original extract must be greater than 0.")
    if real_extract < 0.0 or real_extract > oe:
        raise ValueError("Real extract must be within [0, OE].")

    def residual(ae: float) -> float:
        return cutaia_real_extract(oe, ae) - real_extract

    return brentq(residual, -oe, oe, xtol=1e-12, rtol=1e-14)


def calculate_abv_and_attenuation(oe: float, ae: float) -> dict[str, float]:
    """Calculates ABV, Apparent Attenuation (AA), and Real Degree of

    Fermentation (RDF) from OE and AE (°Plato) using Cutaia et al. (2009).
    """
    if oe <= 0:
        raise ValueError("Original extract (OE) must be greater than 0.")
    if ae > oe:
        raise ValueError("Apparent extract (AE) cannot exceed Original extract (OE).")

    # Alcohol by weight (w/w %) via Cutaia, Reid, & Speers (2009)
    abw = cutaia_abw(oe, ae)

    # Convert AE to specific gravity for volumetric expansion
    fg = plato_to_sg(ae)
    abv = abw * (fg / 0.7907)

    # Apparent Attenuation (fractional and percentage)
    apparent_attenuation = (oe - ae) / oe

    # Real Extract (RE) via Cutaia et al. regression
    real_extract = cutaia_real_extract(oe, ae)

    # Real Degree of Fermentation (RDF)
    rdf = (oe - real_extract) / oe

    return {
        "oe_plato": oe,
        "ae_plato": ae,
        "og_sg": round(plato_to_sg(oe), 4),
        "fg_sg": round(fg, 4),
        "abw_pct": abw,
        "abv_pct": abv,
        "apparent_attenuation_pct": apparent_attenuation * 100.0,
        "real_attenuation_pct": rdf * 100.0,
    }


def invert_from_target_abv_and_attenuation(
    target_abv: float, target_aa_pct: float
) -> dict[str, float]:
    """Inverse 1: Solves for OE and AE (°Plato) given target ABV (%)

    and expected Apparent Attenuation (%).
    """
    if target_abv <= 0:
        raise ValueError("Target ABV must be positive.")
    if not (0 < target_aa_pct <= 100):
        raise ValueError("Target attenuation percentage must be in (0, 100].")

    aa_fraction = target_aa_pct / 100.0

    def objective(oe_trial: float) -> float:
        ae_trial = oe_trial * (1.0 - aa_fraction)
        result = calculate_abv_and_attenuation(oe_trial, ae_trial)
        return result["abv_pct"] - target_abv

    # Bracket search between low session worts (1.0 °P) and extreme gravities (40.0 °P)
    oe_solution = brentq(objective, 1.0, 40.0, xtol=1e-6)
    ae_solution = oe_solution * (1.0 - aa_fraction)

    return calculate_abv_and_attenuation(oe_solution, ae_solution)


def invert_from_oe_and_target_abv(
    oe: float, target_abv: float
) -> dict[str, float]:
    """Inverse 2: Solves for required AE (°Plato) and necessary attenuation

    given a measured OE (°Plato) and a target ABV (%).
    """
    if oe <= 0:
        raise ValueError("Original extract (OE) must be greater than 0.")

    # Theoretical maximum ABV if completely attenuated (AE = 0.0)
    max_abv = calculate_abv_and_attenuation(oe, 0.0)["abv_pct"]
    if target_abv > max_abv:
        raise ValueError(
            f"Target ABV of {target_abv}% exceeds theoretical limit of {max_abv:.2f}% for {oe}°P."
        )

    def objective(ae_trial: float) -> float:
        result = calculate_abv_and_attenuation(oe, ae_trial)
        return result["abv_pct"] - target_abv

    # Brentq search bounded strictly between 0.0 °P and OE
    ae_solution = brentq(objective, 0.0, oe, xtol=1e-6)

    return calculate_abv_and_attenuation(oe, ae_solution)
