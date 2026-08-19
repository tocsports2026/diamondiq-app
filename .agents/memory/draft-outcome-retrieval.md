---
name: Draft outcome retrieval
description: Outcome classification and NDFA linkage rules for player-level draft evidence reports.
---

## Rule

Draft-report retrieval must preserve four distinct source-backed outcomes:

1. **Drafted** — `outcome_group = 'Drafted'`.
2. **Undrafted / signed as free agent** — a separate `outcome_group = 'Undrafted / NDFA'` source row, an undrafted population row carrying an ingestion-created exact normalized-name link, or other direct stored professional-signing evidence (`signed`, signing date, reported bonus, or linked organization).
3. **Undrafted / continued amateur pathway** — an undrafted row without documented professional signing where the stored player class explicitly supports remaining amateur eligibility: high-school, four-year sophomore/junior, or junior-college J1/J2/J3.
4. **Undrafted / no professional signing found** — an undrafted row without documented professional signing where stored eligibility is exhausted, unknown, or otherwise insufficient to safely claim a continuing amateur pathway.

The fourth label means only that no professional signing is documented in currently available production sources. It must never be described as proof that the player did not sign.

**Why:** Job #8 stores verified exact normalized-name NDFA links on the undrafted-population row itself, while unmatched and ambiguous NDFA signings remain separate source rows. The stored player class provides a factual basis for distinguishing clearly available amateur pathways from seniors, graduates, fifth-years, and unknown eligibility whose post-draft pathway is unresolved. Collapsing these states would erase source provenance and overstate what the data proves.

**How to apply:** Reuse `ndfa_match_status` as an existing verified linkage rule, but also respect direct documented-signing fields already stored on the production row. Do not create a new name-matching, duplicate-merging, similarity, or prediction layer. Require at least one factual research filter before adding the undrafted population to a report, so an unscoped request cannot flood the report with the full population.