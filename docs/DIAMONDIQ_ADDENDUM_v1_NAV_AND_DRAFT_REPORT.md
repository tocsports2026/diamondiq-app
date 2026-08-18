# DiamondIQ Addendum v1 — Navigation Correction & Draft Report Evidence Fix

## Supplement to DiamondIQ_Master_Product_Design_and_Replit_Build_Spec_v2.md

> This addendum resolves two conflicts found when the mockup package was reviewed against the master spec:
>
> 1. Some mockups contain inconsistent client navigation and/or a permanent "Scenarios" item that the master spec prohibits.
> 2. The Draft Intelligence Report mockup contains predictive/composite numbers that are not supported by a defined methodology and conflict with DiamondIQ's evidence-first, non-predictive product definition.
>
> This addendum is authoritative over any mockup image wherever the two disagree.

---

# 1. CANONICAL CLIENT NAVIGATION

Every client screen must use this exact navigation structure.

**Home**

**Ask DiamondIQ**

**Intelligence**
- Draft Intelligence
- NIL Intelligence
- Club Draft Intelligence

**My OSM** — entire group hidden when no My OSM feature is enabled; individual items hidden per feature toggle
- Calendar
- Agreements
- Deliverables
- Content & Social

**Reports & Resources**
- My Reports
- Knowledge Center

**Account**
- Athlete Profile
- Settings
- Log Out

## 1.1 Scenarios is not a navigation item

Remove "Scenarios" from the left navigation entirely.

Scenario comparison is a function inside the relevant intelligence workspace:
- Draft Intelligence → compare / run scenario
- NIL Intelligence → compare markets / opportunity scenarios
- Club Draft Intelligence → bonus / club / pick-range scenarios

Never create a standalone Scenarios route or permanent menu item.

## 1.2 Navigation labels are fixed

The navigation labels are always:
- Draft Intelligence
- NIL Intelligence
- Club Draft Intelligence

Workspace page titles may be longer:
- Draft Research Workspace
- NIL Intelligence Research Workspace
- Club Draft Research Workspace

The left navigation never relabels those three items as "Draft Research", "NIL Research", or "Club Draft Research".

## 1.3 Intelligence Requests are Admin-only

Intelligence Requests do not appear in client navigation.

If OSM wants the athlete to know additional information is needed, show a limited inline status inside the report/workspace, e.g.:

> OSM has been notified. Additional verified information is required to complete this analysis.

The athlete does not see Admin request details.

---

# 2. DRAFT INTELLIGENCE REPORT — PHASE 1 EVIDENCE RULE

For Phase 1, use the conservative evidence-first implementation. Unsupported predictive/composite metrics shown in concept mockups are visual artifacts and must not be built.

## 2.1 Remove DI Overall composite score

Do not show a DI Overall score unless OSM later approves a documented formula and data inputs.

Phase 1:
- remove the score;
- replace with evidence-backed historical context and sourced metrics only.

## 2.2 Remove tool grades unless OSM explicitly provides them

Do not generate Hit / Power / Speed / Defense / Arm grades.

Traditional 20–80 scouting grades may appear only if:
- OSM staff manually provide them;
- they are stored as OSM Proprietary Data;
- evaluator and date are stored internally.

Phase 1 default:
- remove all tool grades.

## 2.3 Remove signability percentage

Do not display a probability such as "65% likely to sign."

Phase 1:
- use qualitative, evidence-based language only;
- label any signability discussion as DiamondIQ Analysis / Inference;
- show the factors supporting that inference.

Example:

> Historical comparables in this bonus and player-profile range show relatively high signing rates. This is contextual analysis, not a prediction of the athlete's decision.

## 2.4 Replace round-by-round probabilities with historical base rates

Do not display:
- 62% Round 1
- 23% Comp Round A
- etc.

Instead, where supported by the verified dataset:

> Among 42 historical comparable players meeting these filters from 2015–2026, 9 were selected in Round 1, 14 in Rounds 2–3, 11 in Rounds 4–5, and 8 later or undrafted.

This is a Calculated Result about historical cases, not a prediction about the athlete.

## 2.5 Historical bonus range only

Do not show an "expected bonus range" with confidence percentage.

Where supported:

> Verified historical signing bonuses among the 28 comparable players with reported bonuses ranged from $X to $Y; median $Z.

Required labels:
- Verified / Calculated
- comparable count
- research window
- source/methodology access

Do not present the range as a forecast.

## 2.6 Remove numeric comparable-player scores

Do not show undefined "Comp Score 86" style numbers.

Phase 1 comparable cards should show:
- player;
- year;
- school / level;
- position;
- relevant physical/profile attributes;
- draft selection;
- reported signing bonus where verified;
- plain-language reason the player is included as a comparable.

A future similarity score may be added only after OSM approves the formula.

---

# 3. EVIDENCE LABELING — DRAFT REPORT

Every factual or calculated item on the Draft Intelligence Report must map internally to one of:

1. Verified Public Information
2. OSM Proprietary Data
3. OSM-Provided Athlete Information
4. Calculated Results
5. DiamondIQ Analysis / Inference
6. Missing / Unverified Information

The interface must make sourcing available:
- inline when useful;
- tooltip / hover on desktop;
- tap detail on mobile;
- Sources & Methodology section.

The Draft Report must meet the same visible-sourcing standard as the NIL report.

---

# 4. MOCKUP OVERRIDE RULE

If any reference mockup conflicts with this document:
- the mockup is wrong;
- Replit must follow this addendum;
- do not reproduce the conflicting pixel.

Specifically ignore any mockup that shows:
- Scenarios in client nav;
- Draft Research / NIL Research / Club Draft Research as nav labels;
- client-side Intelligence Requests nav;
- DI Overall score;
- generated tool grades;
- signability percentage;
- athlete-specific round probabilities;
- projected bonus confidence percentage;
- undefined comparable-player numeric scores.

---

# 5. PACKAGE CHANGE LOG

Repository updates:
- Add `docs/DIAMONDIQ_ADDENDUM_v1_NAV_AND_DRAFT_REPORT.md`
- Master spec changelog must reference this addendum.
- Updated visual references should eventually replace conflicting mockups.
- Until corrected images are supplied, this document overrides those images.
