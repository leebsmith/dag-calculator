---
title: Mash regimes, fermentability, styles, and yeasts
status: background reference
source: Gemini chat
retrieved: 2026-10-30
---

# Mash regimes, fermentability, styles, and yeasts

> Imported verbatim; background — not the contract. A generated Gemini chat
> (retrieved 2026-10-30) on the two-lever model — the mash's sugar spectrum and
> the yeast's sugar uptake — and the style strategies around it. It is the source
> material for the mash/yeast/style critiquer
> (`plans/recipe-critiquers.md`). `docs/attenuation-model.md` and
> `data/artifact.json` own the model; where the two disagree, they win.
> Corrections belong in a living document, not in this transcript.

> Query: “Generalize the relationships between mash regimes, fermentability,
> yeast characteristics and beer styles.”

## Generalize the relationships between mash regimes, fermentability, yeast characteristics and beer styles.

Final Gravity (FG), mouthfeel, and perceived dryness are never determined by your mash temperature alone or your yeast strain alone—they are the product of **how the wort's sugar spectrum (created in the mash) aligns with the yeast's genetic sugar-uptake capability (expressed in the fermenter)**.

In every BJCP beer style, you are managing a two-stage biochemical pipeline:

1. **The Mash Lever (Supply):** Determines the ratio of simple sugars (glucose and maltose), intermediate trisaccharides (maltotriose), and unfermentable branched polysaccharides (limit dextrins).
2. **The Yeast Lever (Demand):** Determines how far up that complexity ladder the yeast can climb before it either runs out of genetic transport mechanisms or flocculates to the bottom of the tank.

By understanding both levers, you can either **compensate inversely** (e.g., mashing low to force a sluggish yeast to finish dry, or mashing high to prevent an aggressive yeast from stripping body) or **stack directionally** (e.g., mashing low *and* pitching a hyper-attenuator for a bone-dry Saison, or mashing high *and* pitching a maltotriose-negative yeast for a chewy 3.5% ABV English Mild).

---

## 1. The Mash Lever: Enzymatic Control of the Wort Sugar Spectrum

In a standard all-malt mash at **152°F (66.5°C)**, wort carbohydrates typically break down into **10–12% glucose/fructose/sucrose**, **50–55% maltose**, **12–15% maltotriose**, and **20–25% limit dextrins**. Moving your mash temperature by even 3–4°F dramatically alters the ratio between the last three fractions because the key mash enzymes denature at different temperatures.

| Mash Zone | Temp Range | Active Enzymes | Resulting Wort Carbohydrate Shift | Primary Style Applications |
| --- | --- | --- | --- | --- |
| **Ferulic Acid & $\beta$-Glucan Rest** | **104–122°F** (40–50°C) | Ferulic acid esterase, $\beta$-glucanase | Cleaves heavy oat/wheat/rye gums to lower wort viscosity; releases ferulic acid (the precursor to clove-like 4-vinyl guaiacol in POF+ yeasts). | **10A Weissbier**, **24A Witbier**, Roggenbier, high-adjunct Stouts |
| **$\beta$-Amylase Dominant (High Fermentability)** | **142–148°F** (61–64.5°C) | $\beta$-Amylase (exo-enzyme), Limit Dextrinase (partial) | Chops starch chains cleanly from the non-reducing ends into **maltose**. Minimizes limit dextrins (down to 12–15%) and maximizes fermentability, though conversion takes 60–90 minutes. | **25B Saison**, **26C Belgian Tripel**, **5D German Pils**, **21A West Coast IPA** (with English yeast) |
| **Balanced Dual-Enzyme Zone** | **149–153°F** (65–67°C) | $\beta$-Amylase + $\alpha$-Amylase in equilibrium | Produces the classic middle-ground sugar spectrum (75–80% fermentable sugars, 20–25% dextrins) within 45–60 minutes. | **18B American Pale Ale**, **5B Kölsch**, **6A Märzen**, **13B British Brown Ale** |
| **$\alpha$-Amylase Dominant (High Body / Dextrins)** | **154–160°F** (68–71°C) | $\alpha$-Amylase (endo-enzyme); $\beta$-amylase denatures in 15–20 min | Cleaves starch chains randomly in the middle, leaving behind **25–35% unfermentable limit dextrins** and higher proportions of **maltotriose**. Fast conversion (30–45 min). | **11A–C British Bitters**, **13A Dark Mild**, **14A–C Scottish Ales**, **16A Sweet Stout** |
| **Step Mash (Hochkurz)** | **144°F $\rightarrow$ 160°F** (62°C $\rightarrow$ 71°C) | Sequential $\beta$-Amylase then $\alpha$-Amylase | A 30–40 min rest at 144°F locks in high maltose fermentability; stepping to 160°F for 30 min converts remaining hard starches into foam-positive glycoproteins and dextrins. | **3B Czech Premium Pale Lager**, **4A Munich Helles**, **7B Altbier**, **9A Doppelbock** |

---

## 2. The Yeast Lever: The 5 Biochemical Yeast Archetypes

Once the wort enters the fermenter, yeast strains fall into five distinct biochemical archetypes based on three genetic traits:

* **Sugar Transporters (`MAL` and `AGT1` permeases):** All brewing yeasts transport glucose first via passive diffusion, then switch to maltose. Consuming **maltotriose** (three glucose molecules linked together) requires active energy transport via the `AGT1` (or `MAL11`) permease gene.
* **Flocculation Genes (`FLO1`, `FLO5`, `FLO8`):** Cell-wall lectin proteins that bind to mannose residues on neighboring cells once simple sugars drop below a threshold, pulling the yeast out of suspension.
* **Extracellular Glucoamylase (`STA1`):** The gene responsible for secreting enzymes *outside* the cell that break down unfermentable limit dextrins into simple glucose.

| Yeast Archetype | Sugar Consumption Profile | Typical Apparent Attenuation | Representative Strains | Behavioral Signature |
| --- | --- | --- | --- | --- |
| **1. Maltotriose-Negative (`AGT1` Deficient)** | Glucose, Fructose, Sucrose, **Maltose ONLY** | **62–70%** | LalBrew London, LalBrew Windsor, SafAle S-33, SafAle T-58 | Leaves 100% of maltotriose and limit dextrins untouched. Fast 48–72 hr fermentation; guaranteed full, sweet finish unless mashed very low or diluted with simple sugar. |
| **2. High-Flocculation British & Irish Ales (`FLO1` Dominant)** | Glucose, Maltose, **Partial Maltotriose** | **68–76%** | Wyeast 1968 / WLP002, SafAle S-04, WLP007, WY1084 Irish Ale | Genetically capable of eating maltotriose, but clumps and drops out of suspension early as maltose runs out. Highly sensitive to mash temperature and rousing. |
| **3. Clean High-Attenuating Ale Workhorses** | Glucose, Maltose, **Full Maltotriose** | **77–83%** | US-05 / WLP001 / WY1056, BRY-97, Nottingham, WY2565 Kölsch, Voss/Lutra Kveik | Strong `AGT1` maltotriose transport and lower flocculation. Stays suspended until nearly all maltose and maltotriose are exhausted, leaving only limit dextrins. |
| **4. Bottom-Fermenting Lagers (*S. pastorianus*)** | Glucose, Maltose, **Full Maltotriose**, **Melibiose** | **78–84%** | W-34/70, WY2124 Bohemian, WY2206 Bavarian, S-189 | Hybrid genome ferments down to 45–50°F (7–10°C) and consumes raffinose/melibiose plus virtually all maltotriose, creating a crisp, snappy finish even with all-malt grists. |
| **5. Diastatic (`STA1+`) & *Brettanomyces*** | Glucose, Maltose, Maltotriose, **Limit Dextrins & Starches** | **85–98%+** | Belle Saison, BE-134, WY3711 French Saison, WLP565, *Brettanomyces* spp. | Secretes extracellular glucoamylase (`STA1+`) or intracellular $\alpha$-glucosidase (*Brett*) that chops unfermentable mash dextrins into glucose, overriding mash temperature. |

---

## 3. Universal Matrix: Matching Mash, Yeast, and BJCP Beer Styles

When formulating any BJCP style, you choose between **Directional Stacking** (pushing both levers in the same direction for extreme dryness or extreme body) and **Inverse Compensation** (playing one lever against the other to balance ester/malt character with drinkability).

| Strategy | Mash Regime | Yeast Archetype | Target FG & Mouthfeel | BJCP Style Examples & Why It Works |
| --- | --- | --- | --- | --- |
| **Directional Stacking: Ultra-Dry & Digestible** | **144–148°F** (62–64.5°C) for 75–90 min *(+ optional 10–20% sucrose/candi sugar)* | **Archetype 5 (`STA1+`)** or high-attenuating Belgian Ale | **1.000–1.008 FG** *(Bone-dry, effervescent, high digestability)* | **25B Saison, 26C Belgian Tripel, 26D Belgian Dark Strong:** High ABV without syrupy heaviness. Low mash + simple sugar keeps fermentation fast before `STA1+` enzymes dry out the tail end. |
| **Directional Stacking: Crisp Continental Lagers** | **Hochkurz Step Mash** (145°F $\rightarrow$ 160°F) or Single Infusion at **148–150°F** | **Archetype 4 (Lager)** or **Archetype 3 (Kölsch/Alt)** | **1.008–1.012 FG** *(Crisp, snappy finish with rocky foam and bready depth)* | **4A Munich Helles, 5B Kölsch, 5D German Pils, 7B Altbier:** Complete maltotriose uptake guarantees a clean, dry snap, while the 160°F step rest preserves foam-building glycoproteins. |
| **Inverse Compensation: Rich Malt Lagers & Czech Pils** | **153–156°F** (67–69°C) or **Decoction Mash** | **Archetype 4 (Lager)** | **1.013–1.018 FG** *(Lush, velvety malt body with a clean, non-cloying finish)* | **3B Czech Premium Pale Lager, 6A Märzen, 8A Munich Dunkel, 9A Doppelbock:** Because lager yeast eats all maltotriose and produces zero fruity esters to create the illusion of sweetness, you *must* mash warmer (or decoct) to build unfermentable dextrins for body. |
| **Inverse Compensation: Expressive / English-Fermented IPAs & Pale Ales** | **147–149°F** (64–65°C) | **Archetype 2 (Flocculent English)** | **1.011–1.014 FG** *(Crisp enough for hop punch, with stone-fruit esters & clarity)* | **18B American Pale Ale, 21A American IPA:** Low mash converts starches into simple maltose that S-04 or WY1968 can eat before flocculating out, preventing residual sugar from muting hop oils. |
| **Inverse Compensation: Clean-Fermented Malt or Dark Beers** | **154–158°F** (68–70°C) | **Archetype 3 (Clean Workhorse: US-05 / Chico)** | **1.014–1.020 FG** *(Full-bodied and creamy despite a neutral, high-attenuating yeast)* | **16A Sweet Stout, 19A American Amber, 20A American Porter, 20C Imperial Stout:** If you pitch US-05 into a Stout or Porter mashed at 150°F, it will attenuate down to 1.010 and taste thin and acrid/roasty. Mashing at 156–158°F locks in limit dextrins that US-05 cannot touch. |
| **Directional Stacking: Low-ABV Session Malt Styles** | **156–160°F** (69–71°C) | **Archetype 1 (Maltotriose-Negative)** or **Archetype 2** | **1.012–1.016 FG** from a 1.036 OG *(Full pint body at 3.2–3.8% ABV)* | **11A Ordinary Bitter, 13A Dark Mild, 14A Scottish Light (60/-):** Low-gravity worts easily taste watery. Combining an $\alpha$-amylase mash at 158°F with a maltotriose-negative yeast (like LalBrew London or Windsor) leaves ~35% of the extract behind as body and chewiness. |
| **Inverse Compensation: High-Gravity Hazy / NEIPA** | **152–155°F** (66.5–68.5°C) | **Archetype 3/Hybrid (Verdant / London Ale III)** | **1.014–1.018 FG** *(Pillow-soft mouthfeel that balances juicy hop saturation)* | **21C Hazy IPA:** Unlike West Coast IPAs, NEIPAs rely on residual dextrins, oat/wheat $\beta$-glucans, and yeast glycerol/mannoproteins to coat the tongue and buffer hop burn. |

---

## 4. Four Universal Formulation Rules Across All Beer Styles

### Rule 1: The Yeast Substitution Rule (Adjust 1°F for Every 2% Attenuation Gap)

Whenever you substitute a yeast from one archetype into a recipe designed for another, adjust your mash temperature in the **opposite direction** by roughly **1°F (0.55°C) for every 2% difference in expected apparent attenuation**:

* *Example A (Brewing an English Bitter or Sweet Stout with US-05):* US-05 attenuates ~80% vs. Windsor/London at ~68% (a 12% gap). Raise your mash temperature by **5–6°F** (e.g., from 152°F up to 157–158°F) so the extra limit dextrins stop US-05 at the same target FG.
* *Example B (Brewing a West Coast IPA or Blonde Ale with S-04 or WLP002):* Drop your mash temperature by **3–4°F** (e.g., from 152°F down to 148°F) so $\beta$-amylase converts the maltotriose fraction into simple maltose that the English yeast can easily finish.

### Rule 2: Specialty Malts & Kettle Sugars Bypass the Mash Enzymes

Mash temperature only governs the starches converted *during* the mash. Two common recipe additions bypass mash enzyme control entirely:

* **Crystal / Caramel and Dark Roasted Malts (Decrease Fermentability):** Crystal malts are stewed and kilned at the maltings, locking their sugars into complex caramelization and Maillard compounds that neither $\beta$-amylase nor standard yeast can break down. Every **10% of Crystal malt** in a grain bill lowers total wort fermentability by roughly **3–4% apparent attenuation**, regardless of whether you mash at 146°F or 158°F.
* **Simple Kettle Sugars (Increase Fermentability):** Sucrose, dextrose, honey, and Belgian candi syrup are **100% fermentable** by every yeast archetype (even Archetype 1 maltotriose-negative strains). Because alcohol (SG 0.794) is less dense than water, replacing 10% of base malt with simple sugar increases apparent attenuation by **3–5%** and drops Final Gravity by **0.003–0.004 points**.

### Rule 3: The `STA1+` Diastatic Override (and the Glycerol Exception)

If you pitch an Archetype 5 diastatic yeast (such as Belle Saison, BE-134, or WY3711) or age on *Brettanomyces*, **mash temperature will not meaningfully change your Final Gravity**—whether you mash at 146°F or 158°F, the extracellular glucoamylase enzyme will eventually cleave the limit dextrins into glucose and take the beer down to 1.000–1.004.

* *Why mash temp still matters in Saisons:* Mashing a Saison higher (e.g., 154°F) forces the yeast to work harder via its diastatic pathway late in fermentation, which slows down the final gravity drop by several days and stimulates higher **glycerol and succinic acid production**—giving you a bone-dry 1.002 beer that still feels silky rather than thin on the palate.

### Rule 4: Rebalance Your IBU:GU Ratio and Water Chemistry When FG Shifts

Perceived bitterness and dryness are anchored to Final Gravity, not just Original Gravity:

* **Lower FG = Sharper Perceived Bitterness:** A 45 IBU beer finishing at **1.008** (e.g., 5D German Pils or 21B Cold IPA) tastes significantly more bitter than a 45 IBU beer finishing at **1.016** (e.g., 6A Märzen or 14C Scottish Export).
* **Match Sulfate:Chloride ($\text{SO}_4^{2-}:\text{Cl}^-$) to Your Mash/Yeast Goal:** When stacking for crispness and high attenuation (low mash + Archetype 3/4/5 yeast), lean toward a **2:1 to 3:1 Sulfate-to-Chloride ratio** to sharpen the finish. When building plush body and residual sweetness (high mash + Archetype 1/2 yeast, or 21C Hazy IPA), flip to a **1:2 to 1:3 Sulfate-to-Chloride ratio** (100–150 ppm Chloride) to amplify roundness and malt fullness.
