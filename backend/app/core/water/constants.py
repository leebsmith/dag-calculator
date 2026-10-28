"""Physical and chemical constants for the water-chemistry solver.

Metric standards and table lookups; the provenance of each value is in its own
note.
"""

from __future__ import annotations

BICARBONATE_EQ_WEIGHT = 61.0
CARBONATE_EQ_WEIGHT = 30.0

# Kolbach residual-alkalinity coefficients (approx 1/1.4 and 1/1.7)
RA_CA_COEFF = 0.7143
RA_MG_COEFF = 0.5879

# Carbonic-acid speciation constants
P1_CARBONIC = 6.38
P2_CARBONIC = 10.33
CARBONIC_PKB = 4.3  # pH at which bicarbonate is fully dissociated

# Sparge acid target pH
SPARGE_ACID_PH = 5.80

# Mash-pH model (metric). A bounded logistic over the acidity index `i26`: it
# saturates at a carbonate-buffered ceiling and an acid-grist floor instead of
# extrapolating linearly past them. The parameters track the former linear fit
# through the realistic band (a typical base-malt mash lands near 5.6) and only
# diverge where that fit left the physical range.
MASH_PH_FLOOR = 4.0
MASH_PH_CEIL = 6.0
MASH_PH_MID = 4.0  # `i26` at which pH = midpoint (5.0)
MASH_PH_SCALE = 2.0  # steepness of the saturation
MASH_PH_TARGET_TOLERANCE = 0.01  # accepted |predicted - target| after inversion
QT_PER_L_PER_KG = 2.08635  # 1 L/kg == 2.08635 qt/lb

# Optimal mash pH extraction window
MASH_PH_OPTIMAL_LOW = 5.20
MASH_PH_OPTIMAL_HIGH = 5.60

# Validity band of the linear mash-pH model. Outside it the prediction is
# extrapolation, so the result is flagged rather than presented as physical.
MASH_PH_MODEL_MIN = 3.5
MASH_PH_MODEL_MAX = 7.5

# Biological and toxicological thresholds
DEFAULT_CALCIUM_FLOOR_PPM = 50.0
RECOMMENDED_CALCIUM_MIN_PPM = 30.0
EPSOM_MG_WARN_PPM = 40.0
HARD_MAGNESIUM_MAX_PPM = 50.0
HARD_SULFATE_MAX_PPM = 400.0

# Secondary ion contaminant limits (ppm)
CONTAMINANT_LIMITS = {
    "k": 10.0,
    "fe": 0.10,
    "mn": 0.05,
    "no3": 44.0,
}

# Grain acidity (mEq/kg) by grain type: acidity = mass_kg * (slope * color_L + offset)
GRAIN_ACIDITY = {
    "BASE": {"slope": 0.6174, "offset": 0.0},
    "CRYSTAL": {"slope": 0.46305, "offset": 5.5125},
    "ROASTED": {"slope": 0.0, "offset": 83.79},
    "ACID": {"slope": 0.0, "offset": 209.475},
}

# Salt ion yields (mg ion per gram of salt added per liter)
SALT_COEFFS = {
    "GYPSUM_DIHYDRATE": {"ca": 232.8, "so4": 557.9},
    "GYPSUM_ANHYDROUS": {"ca": 294.4, "so4": 705.6},
    "CACL2_DIHYDRATE": {"ca": 272.6, "cl": 482.3},
    "CACL2_ANHYDROUS": {"ca": 361.1, "cl": 638.9},
    "EPSOM": {"mg": 98.6, "so4": 389.7},
    "NACL": {"na": 393.4, "cl": 606.6},
    "BAKING_SODA": {"na": 273.7, "hco3": 726.4, "alk": 595.4},
    "CHALK": {"ca": 400.4, "alk": 999.0},
    "PICKLING_LIME": {"ca": 540.9, "alk": 1350.0},
}

# Acid properties: pKs (up to triprotic), molar mass, solution strength, density
ACID_PROPERTIES = {
    "LACTIC_88": {
        "pks": (3.86, 20.0, 20.0),
        "mol_wt": 90.08,
        "strength_pct": 88.0,
        "density_g_per_ml": 1.20,
    },
    "PHOSPHORIC_10": {
        "pks": (2.12, 7.20, 12.44),
        "mol_wt": 98.0,
        "strength_pct": 10.0,
        "density_g_per_ml": 1.05,
    },
    "PHOSPHORIC_85": {
        "pks": (2.12, 7.20, 12.44),
        "mol_wt": 98.0,
        "strength_pct": 85.0,
        "density_g_per_ml": 1.685,
    },
}

# Alkaline-agent equivalent weights (g/meq)
ALKALINE_AGENT_EQUIV = {
    "BAKING_SODA": 0.084,
    "CHALK": 0.050,
    "PICKLING_LIME": 0.037,
}
