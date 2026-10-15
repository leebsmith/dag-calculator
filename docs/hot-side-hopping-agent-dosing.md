Dosing for modern hot-side hopping agents (flowable $\text{CO}_2$ extracts, cryogenic lupulin powders, and standardized bittering resins) is specified across four primary frameworks depending on whether the product targets isomerized bitterness, aromatic oil load, or direct pellet substitution.

Unlike traditional T-90 pellets—which are dosed almost exclusively by gross vegetative weight per unit volume (e.g., $\text{oz/gal}$ or $\text{g/L}$) alongside a variable crop-year alpha acid percentage—newer advanced hop products are chemically standardized, shifting how recipes and brewing calculators must parameterize them.

---

## 1. T-90 Pellet Equivalence Ratios ($w/w$)

The most common commercial specification for late-boil and whirlpool extracts or concentrated powders is a direct mass-to-mass replacement ratio against standard T-90 pellets. Because these products strip away non-essential vegetative cellulose to eliminate whirlpool trub loss, suppliers standardize their oil and resin concentrations to mimic a fixed multiple of raw pellet mass:

* **Flowable Whirlpool Extracts (e.g., YCH DynaBoost / 702, Haas Incognito):** Specified at a **1:6 to 1:10** replacement ratio by weight. For example, $1\text{ g}$ of DynaBoost replaces $10\text{ g}$ of T-90 pellets ($1:10$), while Incognito is typically specified at $1:6$ to $1:8$ in the whirlpool.
* **Cryogenic & Enriched Lupulin Powders (e.g., Cryo Hops, Lupomax):** Specified at a **1:2** ($50\%$) to **1:1.4** ($70\%$) mass replacement ratio.
* **Polyphenol & Mouthfeel Ceiling:** Alongside the equivalence ratio, technical data sheets specify a **maximum substitution percentage** (typically $50\%$ to $75\%$ of the hot-side bill). Replacing $100\%$ of T-90 pellets with pure lipid/oil extracts strips the wort of hop-derived polyphenols and tannins, which can thin out mouthfeel, alter protein coagulation during the hot break, and reduce haze stability in New England IPAs.

---

## 2. Target IBU & Alpha Acid Mass ($\text{mg/L}$)

For dedicated hot-side bittering extracts added at the start of the boil (such as Haas Flex or traditional supercritical $\text{CO}_2$ hop extract), dosing is specified stoichiometrically by target bitterness rather than bulk weight or pellet equivalency.

Because these extracts lack solid plant matter and enter the kettle as pre-dissolved or rapidly emulsified liquids, their isomerization kinetics are faster and more efficient than whole cones or T-90 pellets. Dosing requires specifying:

1. **Target $\text{IBU}$ Contribution:** Defining the exact $\text{mg/L}$ of iso-alpha acids desired from the addition.
2. **Standardized Alpha Acid Concentration:** Pure $\text{CO}_2$ extracts vary by lot ($40\%\text{ to }65\%$ alpha acids), whereas flowable bittering products like **Flex** are standardized to an exact alpha acid concentration (typically **$60\%\ w/w$**).
3. **Modified Utilization Factor ($U_{\text{extract}}$):** Standard Tinseth or Rager utilization curves underpredict extract bitterness. Extracts require a **1.15x to 1.25x utilization multiplier** (often achieving $32\%\text{ to }38\%$ utilization in a 60-minute boil compared to $25\%\text{ to }30\%$ for pellets).

$$\text{Mass}_{\text{extract}}\ (\text{g}) = \frac{\text{Target IBU} \times V_{\text{batch}}\ (\text{L})}{\text{AA}\% \times U_{\text{extract}} \times 1000}$$

---

## 3. Direct Volumetric & Mass-per-Volume Rates

When formulating a recipe from scratch rather than converting an existing T-90 bill, flowable hot-side agents are specified directly by mass or volume per unit of knockout wort, bounded by saturation ceilings:

* **Whirlpool Mass/Volume Rates:** Commonly expressed in **$\text{g/L}$** (metric) or **$\text{oz/bbl}$** / **$\text{g/gal}$** (US). Typical whirlpool dosing for flowable extracts like Incognito or DynaBoost ranges from **$0.5\text{ to }2.0\text{ g/L}$** ($0.06\text{ to }0.26\text{ oz/gal}$). Suppliers explicitly cap hot-side extract additions at a ceiling of **$2.0\text{ g/L}$**; exceeding this threshold risks lipid phase separation, oily surface slicks, and severe foam degradation in the finished beer.
* **Specific Gravity / Density Conversion ($\rho$):** Because flowable extracts are viscous liquids or pastes at room temperature (usually preheated in a warm water bath to $40^\circ\text{C}\text{--}50^\circ\text{C}$ before dosing), brewers measure them either gravimetrically on a scale or volumetrically in a graduated vessel. Specifications include a product density—typically **$\rho \approx 0.95\text{ to }1.05\text{ g/mL}$**—allowing seamless conversion between $\text{mL}$ and $\text{g}$.

---

## 4. Total Essential Oil Loading ($\text{mL}$ Oil / $\text{hL}$)

In precision brewing and software modeling, late-hot-side additions are increasingly specified by **total volatile oil volume per unit of wort** (typically **$\text{mL of oil per hL}$**, which equals $\text{mL per 100 L}$ or $0.038\text{ mL/gal}$).

Because flowable extracts are standardized by total oil content (for instance, DynaBoost is standardized to **$10\%\text{ to }12\%\ v/w$ total oil** depending on the varietal, compared to $0.8\%\text{ to }3.0\%$ in raw pellets), dosing by oil volume isolates aromatic intensity from alpha-acid crop fluctuations:

* **Subtle / Noble Whirlpool:** $0.5\text{ to }1.5\text{ mL oil/hL}$
* **Modern Pale Ale / West Coast IPA Whirlpool:** $2.0\text{ to }4.0\text{ mL oil/hL}$
* **Saturated Hazy IPA Whirlpool:** $4.5\text{ to }8.0+\text{ mL oil/hL}$

---

## Comparison of Hot-Side Dosing Specifications

| Product Class | Representative Examples | Primary Dosing Metric | T-90 Equivalence | Key Modeling Adjustments |
| --- | --- | --- | --- | --- |
| **Cryogenic Lupulin** | Cryo Hops, Lupomax | Mass ($\text{g/L}$ or $\text{oz/gal}$) | $1:2$ ($50\%$ of T-90 weight) | Reduce vegetative wort absorption loss by $\approx 50\%$; slight boost ($+5\%$) to whirlpool utilization. |
| **Flowable $\text{CO}_2$ Extracts** | DynaBoost (YCH 702), Incognito | Equivalence ($w/w$) or $\text{g/L}$ ($\text{mL/L}$) | $1:6$ to $1:10$ | **Zero wort absorption loss**; enforce $\le 2\text{ g/L}$ ceiling; apply $10\%\text{--}15\%$ isomerization penalty if added in cooler whirlpools ($75^\circ\text{C}\text{--}85^\circ\text{C}$) due to un-isomerized alpha acids. |
| **Standardized Bittering** | Haas Flex, Supercritical $\text{CO}_2$ | Target $\text{IBU}$ ($\text{mg/L}$ Iso-AA) | Based on exact $\text{AA}\%$ ($60\%$) | **Zero wort absorption loss**; apply **1.15x–1.25x** boil utilization multiplier over Tinseth pellet baseline. |
| **Hot-Side Oil Fractions** | Terpene / Sesquiterpene fractions | Volumetric ($\text{mL/hL}$ or $\mu\text{L/L}$) | Varietal oil equivalent | Zero $\text{IBU}$ contribution ($\text{AA}\% = 0$); zero wort absorption; added strictly at whirlpool cooldown ($\le 80^\circ\text{C}$) to prevent flash-off. || Product Class | Typical Addition Timing | Bitterness & Isomerization Impact | Aroma & Volatile Oil Impact | Wort Matrix & Process Impact |
| --- | --- | --- | --- | --- |
| **Standardized Bittering** *(Haas Flex, Supercritical $\text{CO}_2$)* | **Early Boil** *(60–90 min)* | **Maximum Isomerization:** Pre-liquefied resins disperse instantly without requiring cellular rupture, accelerating isomerization kinetics (+15% to +25% utilization over T-90 pellets). | **Complete Stripping:** Steam distillation flashes off virtually all monoterpenes (myrcene) and most oxygenated sesquiterpenes, leaving a clean, neutral bittering baseline. | **Zero Trub / Reduced Hot Break:** Adds zero vegetative mass, eliminating boil absorption losses. However, the complete absence of hop polyphenols reduces protein-polyphenol coagulation during the hot break. |
| **Cryogenic Lupulin** *(Cryo Hops, Lupomax)* | **Late Boil** *(15–5 min)* <br>

<br>

<br>**Whirlpool** *(Flameout to $80^\circ\text{C}$)* | **Moderate to Low Isomerization:** Late-boil additions yield slightly higher utilization (+5% to +10%) than T-90s due to concentrated lupulin exposure. Cooling the whirlpool to $80^\circ\text{C}$ halts isomerization while retaining humulinones for soft perceived bitterness. | **Targeted Fractionation:** A 10–15 min boil strips grassy/resinous hydrocarbons while retaining denser, water-soluble oxygenated compounds (linalool, geraniol). Sub-$85^\circ\text{C}$ whirlpooling preserves volatile citrus/tropical esters. | **Halved Vegetative Loss:** Reduces whirlpool trub compaction issues and cuts wort absorption losses by ~50%. Retains enough structural polyphenol content to assist in protein flocculation or NEIPA haze stability without imparting vegetative astringency. |
| **Flowable $\text{CO}_2$ Extracts** *(DynaBoost / YCH 702, Incognito)* | **Flameout / Whirlpool** *($95^\circ\text{C}$–$80^\circ\text{C}$)* <br>

<br>

<br>**Kettle Carryover** *(Dip Hopping into FV)* | **Temperature-Dependent Solubility:** These are non-isomerized extracts rich in raw alpha acids. At $95^\circ\text{C}$, they achieve ~10%–15% utilization. At $80^\circ\text{C}$, thermal isomerization drops near zero, but warm turbulence dissolves raw alpha and beta acids that contribute to perceived bitterness. | **High Survival / Biotransformation:** Avoiding the rolling boil prevents steam distillation of volatile terpenes. Routing a portion of warm whirlpool wort into the fermenter before pitching ("dip hopping") blows off unpleasant sulfur/myrcene while staging glycosides and terpenols for yeast biotransformation. | **Zero Absorption / Lipid Ceiling:** 100% wort recovery in the whirlpool. Requires vigorous physical shear (pump recirculation or kettle turbulence) and wort temperatures above $75^\circ\text{C}$ to lowers viscosity and emulsify lipids. Dosing above $2\text{ g/L}$ risks un-emulsified oil slicks that destroy foam stability. |
| **Hot-Side Oil Fractions** *(Distilled Terpene / Varietal Oils)* | **Sub-Isomerization Whirlpool** *($\le 80^\circ\text{C}$)* <br>

<br>

<br>**Heat Exchanger** *(Knockout inline)* | **Zero Bitterness ($\text{0 IBU}$):** Contains no alpha, beta, or iso-alpha acids. Timing has zero effect on bitterness calculations regardless of contact time or wort gravity. | **Flash-Off Criticality:** Extremely volatile. Adding during a rolling boil or a $98^\circ\text{C}$ flameout causes rapid flash-off into the kettle stack. Must be dosed after cooling the whirlpool below $80^\circ\text{C}$ (or injected inline pre-chiller) to lock soluble aromatic fractions into the liquid phase. | **Pure Solvation:** Zero trub, zero polyphenol contribution, and zero wort loss. Relies strictly on thermal dispersion and alcohol/wort solubility rather than solid extraction mechanics. |

### Timing & Kinetic Trade-Offs Across the Hot Side

* **The $80^\circ\text{C}$ ($176^\circ\text{F}$) Isomerization Threshold:** For both **Cryogenic Lupulin** and **Flowable $\text{CO}_2$ Extracts**, $80^\circ\text{C}$ serves as the primary kinetic boundary. Above this temperature, alpha acids continue to thermally isomerize into iso-alpha acids while low-boiling-point monoterpenes (like myrcene, boiling point $167^\circ\text{C}$ but highly steam-volatile) flash off. Dropping the whirlpool via a heat exchanger or cold liquor addition to $75^\circ\text{C}\text{--}80^\circ\text{C}$ before dosing arrests IBU accumulation and maximizes aromatic oil retention.
* **Viscosity vs. Volatility in Flowable Extracts:** **Flowable $\text{CO}_2$ Extracts** present a physical trade-off in the whirlpool. If the wort is cooled too aggressively (e.g., below $70^\circ\text{C}$) to protect delicate aromatics, the high viscosity of the resinous extract prevents proper emulsification, causing the extract to smear onto kettle walls or settle into the trub cone rather than dissolving into the wort. They require the thermal energy and mechanical shear of an active, warm whirlpool ($80^\circ\text{C}\text{--}95^\circ\text{C}$) to disperse evenly.To model the $75^\circ\text{C}$ to $98^\circ\text{C}$ ($167^\circ\text{F}$ to $208^\circ\text{F}$) whirlpool window accurately, we have to treat the whirlpool not as a static step, but as a coupled thermodynamic system: **Arrhenius-driven isomerization moving in one direction, and vapor-pressure/solubility-driven oil retention moving in the other.**

Furthermore, when introducing modern hot-side agents (like flowable $\text{CO}_2$ extracts), a third physical boundary emerges: **emulsification viscosity**.

---

## 1. Temperature-Dependent Isomerization Kinetics ($\text{IBU}$)

Standard Tinseth utilization models assume a constant boiling temperature ($100^\circ\text{C}$), breaking down completely in a sub-boiling whirlpool. To extend Tinseth across the $75^\circ\text{C}\text{--}98^\circ\text{C}$ window, we decouple the **time-gravity base utilization** from a **temperature-dependent Arrhenius scaling factor** ($k_T$) and a **product-form multiplier** ($M_{\text{form}}$).

### The Arrhenius Sub-Boiling Factor

Alpha-acid isomerization follows first-order kinetics with an empirical activation energy ($E_a$) of approximately $79.1\text{ to }88.0\text{ kJ/mol}$ (Perkins/Malowicki models). Relative to a $100^\circ\text{C}$ ($373.15\text{ K}$) boil baseline, the relative rate constant $f_{\text{temp}}(T)$ at whirlpool temperature $T$ (in Kelvin) is:

$$f_{\text{temp}}(T) = \exp\left( -\frac{E_a}{R} \left( \frac{1}{T} - \frac{1}{373.15} \right) \right)$$

Where $R = 8.314\text{ J/(mol}\cdot\text{K)}$. Using a standard empirical fit ($E_a/R \approx 9500\text{ K}$), the relative isomerization rate drops precipitously across the target window:

* **$98^\circ\text{C}$ ($371.15\text{ K}$):** $f_{\text{temp}} \approx 0.87$ ($87\%$ of boiling isomerization speed)
* **$90^\circ\text{C}$ ($363.15\text{ K}$):** $f_{\text{temp}} \approx 0.49$ ($49\%$ of boiling speed)
* **$85^\circ\text{C}$ ($358.15\text{ K}$):** $f_{\text{temp}} \approx 0.34$ ($34\%$ of boiling speed)
* **$80^\circ\text{C}$ ($353.15\text{ K}$):** $f_{\text{temp}} \approx 0.23$ ($23\%$ of boiling speed)
* **$75^\circ\text{C}$ ($348.15\text{ K}$):** $f_{\text{temp}} \approx 0.16$ ($16\%$ of boiling speed)

### The Non-Isothermal Cooling Integral

Because a whirlpool rarely sits at a single static temperature for 20 to 40 minutes, a static temperature input overpredicts utilization. If a vessel cools from $T_{\text{start}}$ to $T_{\text{end}}$ over duration $t_{\text{wp}}$ according to Newton’s Law of Cooling, $T(t) = T_{\text{ambient}} + (T_{\text{start}} - T_{\text{ambient}})e^{-c t}$, we integrate an **effective boiling-equivalent time** ($t_{\text{eff}}$) and feed that into the standard Tinseth time decay function:

$$t_{\text{eff}} = \int_{0}^{t_{\text{wp}}} f_{\text{temp}}(T(t)) \, dt$$

$$U_{\text{wp}} = M_{\text{form}} \cdot f_{\text{gravity}}(G) \cdot \left( \frac{1 - e^{-0.04 \cdot t_{\text{eff}}}}{4.15} \right)$$

### The Product Form Multiplier ($M_{\text{form}}$) & The Viscosity Trap

For T-90 pellets ($M_{\text{form}} = 1.0$) and Cryo/Lupomax ($M_{\text{form}} \approx 1.05\text{--}1.10$), $M_{\text{form}}$ is static across the temperature window.

For **flowable $\text{CO}_2$ extracts** (Incognito, DynaBoost), $M_{\text{form}}$ is **piecewise or sigmoidally dependent on temperature and shear**. Above $90^\circ\text{C}$, the extract is low-viscosity and pre-ruptured, yielding $M_{\text{form}} \approx 1.15$. However, as the temperature approaches $75^\circ\text{C}$, lipid viscosity climbs rapidly. Without aggressive pump shear, the resin forms globules with low surface-area-to-volume ratios, dropping effective utilization below T-90 pellets ($M_{\text{form}} \approx 0.75\text{--}0.85$).

---

## 2. Modeling Aromatic Oil Retention & Fractionation

Modeling "total oil retention" as a single scalar fails in the $75^\circ\text{C}\text{--}98^\circ\text{C}$ window because hop oil is a biphasic mixture of compounds with vastly different volatilities and polarities. To get meaningful sensory predictions, the model should split total oil into two kinetic buckets:

1. **Non-Polar Hydrocarbons (Monoterpenes & Sesquiterpenes):** Myrcene, humulene, caryophyllene (typically $70\%\text{--}80\%$ of total oil). Highly hydrophobic; low aqueous solubility; high Henry's Law volatility in hot wort.
2. **Oxygenated Terpenoids & Thiols:** Linalool, geraniol, citronellol, esters (typically $20\%\text{--}30\%$ of total oil). Polar; significantly higher aqueous solubility; resistant to steam stripping below $90^\circ\text{C}$.

### First-Order Evaporative Decay

During an uncovered or vented whirlpool stand of duration $t$, the surviving fraction $R_i$ of each aromatic bucket $i$ follows an exponential decay driven by a temperature-dependent volatilization constant $k_{\text{vol}, i}(T)$:

$$R_i(T, t) = \exp\left( -k_{\text{vol}, i}(T) \cdot t \right)$$

However, unlike simple boiling, **aqueous solubility caps the maximum retainable concentration** ($C_{\text{max}, i}$) of non-polar hydrocarbons:

* **Myrcene Solubility Ceiling:** In wort, myrcene saturates at very low thresholds (roughly $0.5\text{ to }1.5\text{ mg/L}$ depending on wort gravity and lipid/protein binding), whereas linalool and geraniol remain soluble well past $50\text{ mg/L}$.
* **Form Factor Advantage (Oil Partitioning):** In T-90 pellets, vegetative matter acts as an adsorbent sponge—a significant fraction of non-polar oils partitions back onto the solid trub cone and stays in the kettle. Flowable extracts and oil fractions have **zero solid trub adsorption**, meaning $100\%$ of the un-volatilized oil remains in the liquid phase (either dissolved or micro-emulsified), until hitting the $2\text{ g/L}$ phase-separation ceiling.

---

## 3. Kinetic Behavior Across the $75^\circ\text{C}$ to $98^\circ\text{C}$ Window

Assuming a standard **20-minute whirlpool stand**, the coupled parameters behave as follows across the thermal gradient:

| Whirlpool Temp | $f_{\text{temp}}(T)$ (Relative to $100^\circ\text{C}$) | Effective 20-Min Util. ($U_{\text{base}}$ T-90 @ 1.050) | Flowable Extract Dispersion Efficiency | Hydrocarbon Survival *(Myrcene / Humulene)* | Oxygenated Survival *(Linalool / Geraniol)* |
| --- | --- | --- | --- | --- | --- |
| **$98^\circ\text{C}$ ($208^\circ\text{F}$)** | $0.87$ | $\approx 10.5\%$ | **100%** *(Instant liquefaction; max isomerization)* | **10% – 20%** *(Rapid flash-off; resinous/spicy shift)* | **45% – 60%** *(Moderate thermal stripping)* |
| **$90^\circ\text{C}$ ($194^\circ\text{F}$)** | $0.49$ | $\approx 6.9\%$ | **95% – 100%** *(Ideal viscosity vs. thermal energy)* | **25% – 40%** *(Steady evaporative loss)* | **70% – 80%** *(High retention of floral/citrus alcohols)* |
| **$85^\circ\text{C}$ ($185^\circ\text{F}$)** | $0.34$ | $\approx 5.1\%$ | **85% – 95%** *(Sweet spot for pumped/HERMS whirlpool)* | **45% – 60%** *(Below steam-stripping threshold)* | **85% – 90%** *(Minimal loss; optimal glycosylation staging)* |
| **$80^\circ\text{C}$ ($176^\circ\text{F}$)** | $0.23$ | $\approx 3.6\%$ | **75% – 85%** *(Requires pre-warming extract to $45^\circ\text{C}$ + pump shear)* | **65% – 75%** *(High myrcene retention; pungent green/citrus)* | **90% – 95%** *(Near-complete preservation)* |
| **$75^\circ\text{C}$ ($167^\circ\text{F}$)** | $0.16$ | $\approx 2.6\%$ | **50% – 70%** *(Risk of kettle wall smearing if low shear)* | **75% – 85%** *(Capped primarily by wort solubility limit)* | **95%+** *(Virtually zero thermal loss)* |

---

## 4. Non-Iso-Alpha "Perceived Bitterness" Offset

If a massive whirlpool addition at $75^\circ\text{C}\text{--}80^\circ\text{C}$ is modeled strictly via Arrhenius isomerization, the calculated $\text{IBU}$ will look deceptively low ($2\%\text{ to }3\%$ utilization), yet the finished beer will taste distinctly bitter.

In that lower thermal window, two non-isomerized pathways take over:

1. **Humulinones (Oxidized Alpha Acids):** Present naturally in T-90 pellets ($0.2\%\text{--}0.5\%$) and concentrated in Cryo/Lupomax ($0.5\%\text{--}1.0\%$). Humulinones are highly water-soluble and dissolve completely at $75^\circ\text{C}$ without requiring thermal isomerization. They are roughly **$66\%$ as bitter as iso-alpha acids** and register on standard spectrophotometric $\text{IBU}$ tests. *(Note: Supercritical $\text{CO}_2$ flowable extracts contain almost zero humulinones, making them noticeably softer at $80^\circ\text{C}$ than pellets).*
2. **Un-isomerized Alpha Acids & Hulupones:** Warm turbulence in the $80^\circ\text{C}$ window dissolves raw alpha acids up to their wort solubility limit ($\approx 14\text{--}20\text{ mg/L}$, though fermentation pH drops this down to $\approx 5\text{--}10\text{ mg/L}$).

---

## 5. Architectural Checkpoints for Your Model

Before translating these dynamics into a schema or calculation engine, several design boundaries are worth establishing depending on the desired degrees of freedom:

* **Thermal Profile vs. Point Temperature:** Should the model accept a single static whirlpool target temperature (e.g., chilling to $82^\circ\text{C}$ via a heat exchanger or HERMS coil and holding), or should it model passive cooling from $98^\circ\text{C}$ using an equipment-specific thermal decay constant?
* **Bitterness Output Metric:** Should the model strictly output **True Iso-Alpha Acids ($\text{mg/L}$)** via the Arrhenius curve, or should it also compute a **Perceived Bitterness / Spectrophotometric IBU** that layers in dissolved humulinones from pellets/Cryo versus pure $\text{CO}_2$ extracts?
* **Oil Representation:** Are you looking to track a single normalized **Surviving Oil Yield ($\text{mL/hL}$)** for recipe scaling, or do you want to split the state vector into **Hydrocarbon vs. Oxygenated Fractions** to predict sensory shifts?
