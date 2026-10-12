"""
Brewing calculation utility functions, including ASBC standard conversions
between Specific Gravity (SG) and degrees Plato, and advanced Cutaia et al. (2009)
fermentation solvers.
"""


from scipy.optimize import brentq


def plato_to_sg(plato: float) -> float:
    """Converts degrees Plato to Specific Gravity (20°C/20°C)

    using the official ASBC 3rd-order polynomial.
    """
    if plato < 0:
        raise ValueError("Degrees Plato cannot be negative.")

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


def calculate_abv_and_attenuation(oe: float, ae: float) -> dict[str, float]:
    """Calculates ABV, Apparent Attenuation (AA), and Real Degree of

    Fermentation (RDF) from OE and AE (°Plato) using Cutaia et al. (2009).
    """
    if oe <= 0:
        raise ValueError("Original extract (OE) must be greater than 0.")
    if ae > oe:
        raise ValueError("Apparent extract (AE) cannot exceed Original extract (OE).")

    # Alcohol by weight (w/w %) via Cutaia, Reid, & Speers (2009)
    abw = (0.372 + 0.00357 * oe) * (oe - ae)

    # Convert AE to specific gravity for volumetric expansion
    fg = plato_to_sg(ae)
    abv = abw * (fg / 0.7907)

    # Apparent Attenuation (fractional and percentage)
    apparent_attenuation = (oe - ae) / oe

    # Real Extract (RE) via Cutaia et al. regression
    real_extract = (
        0.49681569 * abw
        + 1.0015341 * ae
        - 0.00059105 * (abw * ae)
        - 0.00029431 * (ae**2)
    )

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
