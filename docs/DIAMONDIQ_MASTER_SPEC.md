# DiamondIQ Master Product Design & Replit Build Specification
## Version 2 — O'Connell Sports Management / TOC Sports Client Intelligence Platform

> **This file is the single source of truth for the DiamondIQ build.**
>
> It supersedes fragmented prior prompts, mockup assumptions, duplicate page concepts, and any AI-generated branding visible in concept images.
>
> Replit should build the application from this specification, the approved project assets, the approved data sources, and the approved visual references. It should **not infer or invent missing product requirements**.

## VERSION 2 CHANGE LOG — AUTHORITATIVE

Version 2 incorporates **DiamondIQ Addendum v1 — Navigation Correction & Draft Report Evidence Fix**.

Changes:
- establishes one canonical client navigation across every screen;
- removes Scenarios as a permanent navigation item;
- confirms Intelligence Requests are Admin-only;
- locks nav labels as Draft Intelligence / NIL Intelligence / Club Draft Intelligence;
- removes unsupported predictive/composite metrics from the Phase 1 Draft Intelligence Report;
- requires evidence labeling for every factual or calculated Draft Report element;
- states explicitly that written specification overrides conflicting mockup pixels.

For Phase 1, the conservative Option B path is selected for all unsupported Draft Report predictive/scored elements.


---

# 1. PRODUCT PURPOSE

DiamondIQ is the private intelligence and education platform of **O'Connell Sports Management / TOC Sports**.

It is **not**:
- a public consumer SaaS product;
- a subscription analytics product;
- a self-service sports agency replacement;
- an automated NIL valuation calculator;
- a draft predictor;
- a generic AI chatbot;
- a public scouting database.

DiamondIQ exists to give represented OSM athletes access to the proprietary knowledge, historical research, data, education, market intelligence, and analytical tools accumulated by O'Connell Sports Management.

The agency continues to perform the strategic, advisory, negotiation, marketing, outreach, and representation work.

DiamondIQ helps the athlete:
- understand;
- investigate;
- prepare;
- ask better questions;
- see the historical and market context behind OSM strategy.

**Core positioning:**

> You have access to this intelligence because you are an OSM client.

---

# 1.1 FORMALLY APPROVED METHODOLOGY & VALIDATION OBJECTIVES

**Status: OSM-approved and locked.**

## Product objective

DiamondIQ's objective is to use verified historical and contemporaneously available evidence to determine where an athlete's documented profile and draft situation fit within relevant historical player populations; identify the Draft Results experienced by genuinely comparable players and the factors associated with materially different Draft Results; and provide OSM and its clients with an evidence-supported assessment of the athlete's market, opportunities, risks, leverage, and decision environment without presenting uncertainty as fact.

## Validation objective

Determine whether DiamondIQ, using only information that was available at the historical point of assessment, identifies appropriate comparison populations and meaningful differentiating factors and produces an evidence-supported assessment that is consistent with subsequently observed Draft Results.

## Definitional note: Draft Result

“Draft Result” is intentionally the comprehensive term. It must not be reduced solely to draft position, round, or drafted/undrafted status.

The detailed components and scoring rules for Draft Result have **not** yet been approved. Do not create them, infer them, or implement a scoring model yet.

## Methodology lock

Until OSM separately approves the detailed Draft Result components and scoring rules:

- do not alter report-generation logic;
- do not alter retrieval logic;
- do not alter cohort logic;
- do not implement validation scoring;
- do not run historical tests;
- do not inspect outcomes for the purpose of choosing methodology;
- do not generate new DiamondIQ inferences;
- do not modify production evidence.

This lock records product and validation objectives only. It does not authorize analytical implementation, retrospective testing, scoring, or changes to production behavior.

---

# 2. NON-NEGOTIABLE BUILD RULES

## 2.1 Official branding only

### TOC Sports logo
The TOC Sports logo is a protected production asset.

Replit must:
- use **only** the official TOC Sports logo asset supplied by OSM;
- render it exactly as provided;
- never recreate it using CSS, SVG paths, text, icons, AI generation, tracing, illustration, or approximated geometry;
- never place a fabricated TOC mark under, behind, beside, or around the official asset;
- never alter the logo shape;
- never distort it;
- never change its proportions;
- never substitute a shield, monogram, wordmark, or invented version.

**If the official TOC Sports asset fails to load, show no TOC Sports logo rather than creating a substitute.**

The repository should contain a production-safe export from the user-supplied original Illustrator file:
- `assets/branding/toc-sports-logo.svg`
- optional high-resolution fallback: `assets/branding/toc-sports-logo.png`

### DiamondIQ branding
Use only the approved DiamondIQ identity:
- approved **Name Concept #2** wordmark;
- approved **Heat Map Concept #3** visual identity;
- approved dark navy / black / teal visual language.

Do not generate new DiamondIQ marks.

---

## 2.2 Evidence-first AI

DiamondIQ must never guess what it does not know.

DiamondIQ must distinguish between:

1. **Verified Public Information**
2. **OSM Proprietary Data**
3. **OSM-Provided Athlete Information**
4. **Calculated Results**
5. **DiamondIQ Analysis / Inference**
6. **Missing or Unverified Information**

If a factual claim cannot be supported by:
- verified public research;
- an approved OSM dataset;
- an approved OSM instruction;
- or an approved athlete record;

then DiamondIQ must not present the claim as fact.

Appropriate responses include:

> “I do not have enough verified information to answer that.”

> “The current OSM dataset does not contain that information.”

> “I found conflicting information and have requested OSM review.”

> “This is an analytical conclusion rather than a verified fact.”

> “Additional OSM input is required before this portion of the report can be completed.”

### Absence-of-evidence rule

DiamondIQ must never convert lack of evidence into a categorical claim.

Correct:

> “No verified prior NIL partnership was identified in the sources reviewed.”

Incorrect:

> “This company has never done NIL.”

---

## 2.3 Every report requires OSM Admin approval before athlete visibility

This rule applies to:
- Draft Intelligence Reports;
- NIL Intelligence Reports;
- Club Draft Intelligence Reports;
- payment / bonus analysis;
- comparisons;
- scenarios;
- future report types.

### Report lifecycle

`Research → Generate Internal Report → OSM Admin Review → Publish → Athlete View`

A newly generated report is always:

**Status: Pending Analysis / OSM Admin Review Required**

The athlete:
- cannot read the report before publication;
- sees a blurred / out-of-focus report shell;
- sees a centered notice explaining that OSM is reviewing the analysis.

Suggested athlete-facing copy:

> **PENDING ANALYSIS**
>
> OSM Admin Review Required
>
> DiamondIQ has completed the initial analysis. Your OSM team is reviewing the report for accuracy, context, and appropriate presentation. You will be notified when the report is ready.

### OSM Admin review controls

OSM Admin sees the complete internal report.

For every potentially sensitive, critical, comparative, financial, probabilistic, or athlete-evaluative item, Admin may choose:

- **Keep**
- **Edit**
- **Replace**
- **Hide**

**Hide must always be available.**

When valid alternatives exist, DiamondIQ may present **2–3 suggested replacements**.

The alternatives must:
- preserve factual integrity;
- be more constructive or context-sensitive;
- never manufacture a positive alternative unsupported by evidence.

Admin may also:
- add internal-only notes;
- soften wording;
- remove unnecessary comparison;
- suppress specific statistics from athlete view;
- retain all hidden information internally.

The Admin then selects:

**Publish Report**

Only then is the athlete-facing version visible.

---

## 2.4 Criticism and sensitive analysis must use a delicate lens

DiamondIQ is an athlete education tool, not an automated critic.

Accurate information does not automatically belong in athlete-facing presentation.

The report engine should surface the full analysis to OSM Admin first.

Athlete-facing language should:
- educate rather than embarrass;
- contextualize rather than label;
- avoid unnecessary negative comparisons;
- avoid language that sounds definitive when evidence is probabilistic;
- separate “development area” from “deficiency”;
- avoid demeaning or insulting phrasing;
- remain professional and useful.

Example:

Internal:
> “Average raw power could limit ceiling.”

Potential athlete-facing replacement:
> “Current power production is closer to the historical average for this comparison group; continued strength development could expand future outcomes.”

If no appropriate replacement exists:
> Hide the item.

---

# 3. USER ROLES

## 3.1 Athlete / Client
Can access only enabled modules and published content associated with their account.

## 3.2 OSM Staff
Can access broader athlete records, research, reports, and approved internal tools according to permissions.

## 3.3 OSM Administrator
Can:
- create users;
- disable users;
- delete users;
- reset access;
- assign athletes;
- enable/disable modules;
- upload and classify data;
- manage methodology;
- respond to Intelligence Requests;
- review reports;
- edit/replace/hide report content;
- publish reports;
- manage Knowledge Center;
- manage NIL operational data;
- manage system settings.

---

# 4. AUTHENTICATION & ACCESS

DiamondIQ is client-only.

Admin must be able to:
- create access;
- associate account with athlete profile;
- suspend access immediately;
- reset access credentials;
- deactivate account;
- delete account;
- see last login;
- assign feature permissions.

Admins should not manually know or store users’ raw passwords.

Use a secure authentication provider and password-reset flow.

---

# 5. FEATURE TOGGLES

Not every athlete should see every module.

Feature access is controlled per athlete.

Initial toggles:

- Draft Intelligence
- NIL Intelligence
- Club Draft Intelligence
- Knowledge Center
- NIL / Marketing Management
- Social / Content Tools
- Calendar
- Agreements
- Deliverables

### Important distinction

**NIL Intelligence** and **NIL Management** are not the same thing.

An athlete can have NIL Intelligence enabled without having any active NIL deals.

If **NIL Management = OFF**, its operational navigation items disappear completely.

Do not show:
- locked menus;
- empty calendar;
- “no deals yet” placeholder;
- upgrade language.

The module simply does not exist in that athlete’s interface.

---

# 6. GLOBAL CLIENT NAVIGATION

Every client screen uses the exact same navigation.

- Home
- Ask DiamondIQ

### Intelligence
- Draft Intelligence
- NIL Intelligence
- Club Draft Intelligence

### My OSM — optional / conditional
- Calendar
- Agreements
- Deliverables
- Content & Social

The entire My OSM group disappears if none of its features are enabled. Individual items disappear according to feature toggles.

### Reports & Resources
- My Reports
- Knowledge Center

### Account
- Athlete Profile
- Settings
- Log Out

## Canonical navigation rules

- **Scenarios is never a permanent nav item.** Scenarios and comparisons live inside the relevant intelligence workspace.
- Nav labels are always **Draft Intelligence**, **NIL Intelligence**, and **Club Draft Intelligence**.
- Workspace titles may be longer and differ from nav labels.
- **Intelligence Requests are Admin-only** and never appear in client navigation.
- Athlete-facing "OSM has been notified" messaging stays inline in the relevant report/workspace.

# 7. GLOBAL VISUAL DESIGN SYSTEM

The approved DiamondIQ visual identity should feel like:

**private professional baseball intelligence terminal + premium sports agency research department**

Not:
- flashy consumer SaaS;
- cyberpunk;
- generic AI startup;
- gambling interface;
- fantasy sports;
- social media app.

## Colors
Primary environment:
- near-black;
- midnight navy;
- dark charcoal.

Primary accent:
- approved DiamondIQ teal / aqua.

Secondary:
- cool gray;
- warm off-white;
- restrained official TOC/OSM blue where appropriate.

Use:
- green only for positive/verified state;
- amber only for caution or incomplete verification;
- red only for clear system risk/error or Admin-only sensitive flag.

Do not introduce unrelated blue/gold themes.

## Typography
Recommended:
- **Inter** for interface text, tables, controls, body;
- **Barlow Condensed** for headings, major metrics, selected labels.

## UI
- restrained rounded corners;
- crisp thin borders;
- minimal shadow;
- dense data only on report screens;
- clean workspaces;
- strong hierarchy;
- no decorative clutter;
- no city photography on Home unless the user is inside a market report.

---

# 8. PAGE ARCHITECTURE — CLIENT APP

There are **12 primary client screens**.

Research modes, scenarios, report states, and Admin review are **functions/states**, not extra numbered pages.

---

# PAGE 1 — HOME
**Status: Approved structure**

## Purpose
Orient the athlete and make the platform easy to navigate.

The Home page is not a data report.

## Required content

### Athlete welcome
- athlete name;
- concise profile information;
- official athlete image only if approved/provided;
- profile link.

### Primary intelligence entry points
Three clear modules:
- Draft Intelligence
- NIL Intelligence
- Club Draft Intelligence

### Ask DiamondIQ
A restrained global research entry point.

### Upcoming
Show only if calendar / NIL management features are enabled.

Display a small number of upcoming obligations:
- appearance;
- signing;
- post;
- NIL payment;
- meeting;
- etc.

### Recent Reports
A short list with link to My Reports.

## Do not show on Home
- detailed charts;
- NIL valuation dashboards;
- market heat maps;
- club spending graphs;
- confidence grids;
- heavy report data;
- fake analytics.

Detailed analysis belongs in reports.

---

# PAGE 2 — ASK DIAMONDIQ
**Status: Approved structure**

## Purpose
Natural-language access to all approved intelligence engines.

The user may type a question such as:

> “Show me SEC RHP drafted from 2015–2026 who were outside the Baseball America Top 100 and what they signed for.”

DiamondIQ determines the appropriate intelligence engine.

## Required content
- large natural-language input;
- optional context attachment;
- intelligence scope selector;
- recent queries;
- guidance;
- popular questions.

## Popular Questions

Initially provide 10 curated example questions.

Initial examples:

1. Show me players similar to my profile and where they were drafted.
2. What did players like me historically sign for?
3. Show me players from my conference drafted at my position over the last 10 years.
4. How does being ranked in my current range historically correlate with draft position?
5. Which MLB clubs draft players with my profile most often?
6. Which clubs have historically paid the most over slot in my projected draft range?
7. Show me how teams have allocated their bonus pools across their first 10 picks.
8. Compare historical draft and signing outcomes of players from my school with similar programs.
9. Which NIL markets offer the strongest realistic opportunities for an athlete with my profile?
10. Compare NIL opportunities between the schools or markets I am considering.

### Dynamic behavior

As DiamondIQ is used:
- aggregate frequently repeated question patterns;
- normalize them into reusable prompts;
- show the 10 most common relevant questions.

Do not reveal:
- which athlete asked;
- individual search history;
- private athlete details.

Context-specific popular questions may appear inside Draft / NIL / Club workspaces.

---

# PAGE 3 — DRAFT RESEARCH WORKSPACE
**Status: Approved structure**

## Purpose
Structured draft research for athletes who want guided control over variables.

This is different from Ask DiamondIQ.

**Ask DiamondIQ:** “I have a question.”

**Draft Research Workspace:** “I want to control the research variables.”

## Research modes
- Players Like Me
- Draft Outcomes
- Signing Bonuses
- Rankings vs. Outcomes
- School / Conference
- Position Trends

These are research modes, not separate permanent pages.

## Profile auto-fill
Use athlete record to pre-populate:
- position;
- bats;
- throws;
- height;
- weight;
- school;
- conference;
- draft class;
- geographic background;
- approved rankings.

## Research variables
Examples:
- position;
- height range;
- weight range;
- level;
- school type;
- conference;
- ranking source/range;
- age range;
- draft years;
- round range;
- geographic filters.

Show estimated matching records only if genuinely calculated from an available dataset.

## Output
Generate Draft Intelligence Report → Page 6.

---

# PAGE 4 — NIL INTELLIGENCE RESEARCH WORKSPACE
**Status: Approved structure**

## Purpose
Research real NIL / market opportunities.

Do not design this as a database of private NIL transaction amounts.

Primary objective:
- identify realistic opportunity landscape;
- specific targets;
- decision-makers when verifiable;
- precedent;
- concepts;
- outreach strategy.

## Research flow

### 1. Define Research Focus
Auto-fill:
- athlete;
- school;
- market.

Inputs:
- timeframe;
- radius;
- opportunity types;
- exclusions / category restrictions.

Opportunity types may include:
- appearances;
- autograph/card signings;
- social content;
- camps/clinics;
- brand partnerships;
- events;
- signature item;
- community partnerships;
- product features;
- other.

### 2. What DiamondIQ already knows
Show availability states for:
- athlete profile;
- school context;
- market research;
- OSM proprietary intelligence.

### 3. Additional Information Needed
DiamondIQ identifies missing information that would materially improve the report.

Examples:
- social media analytics;
- existing brand agreements;
- endorsement category restrictions;
- travel radius;
- schedule/availability;
- personal interests/causes.

Athlete-facing message:
> DiamondIQ needs additional verified information to complete this analysis. Your OSM team has been notified.

### Intelligence Requests
Generate an Admin-side request with:
- athlete;
- report;
- missing information;
- why it matters;
- recommended next step.

## Research modes
- Market Opportunity Analysis
- Target Businesses
- Decision Makers
- Deal Ideas & Concepts
- Market Comparison
- NIL Ecosystem
- Precedent Research

## Output
Generate NIL Intelligence Report → Page 7.

---

# PAGE 5 — CLUB DRAFT RESEARCH WORKSPACE
**Status: Approved structure**

## Purpose
Analyze how MLB organizations have historically drafted and paid players.

## Research focus
- MLB club;
- draft year;
- pick range;
- report focus;
- optional comparison clubs;
- analysis depth.

## Research modes
- Club Draft Strategy Overview
- Pick-by-Pick Tendencies
- Bonus Pool & Payment Behavior
- Player Type & Profile Analysis
- Region & Pipeline Analysis
- Club Comparisons
- Draft Outcome / Historical Success

## Data sources
Use only:
- verified draft history;
- verified reported signing bonuses;
- official or verified slot values;
- verified bonus pool information;
- approved OSM data;
- approved OSM proprietary intelligence.

Never fabricate:
- unreported signing bonus;
- club intention;
- private scouting preference;
- current strategy;
- internal budget allocation.

If a report would benefit from undisclosed information, create an Intelligence Request.

## Output
Generate Club Draft / Payment Intelligence Report → Page 8.

---

# PAGE 6 — DRAFT INTELLIGENCE REPORT
**Status: Approved structure; Phase 1 evidence implementation corrected by Addendum v1**

## Purpose
Rich historical Draft Intelligence output.

DiamondIQ is not a draft predictor. The report must explain historical evidence and context rather than assign unsupported predictive probabilities to the athlete.

## Possible report sections
- Research Question
- Applied Variables
- Data Scope
- Years Analyzed
- Comparable Count
- Historical Draft Outcomes
- Historical Round Distribution / Base Rates
- Pick Range Context
- Historical Signing Bonus Analysis
- Slot Value Context
- Comparable Players
- School / Conference Context
- Geographic Context
- Club Tendencies
- Key Historical Findings
- OSM Context
- Sources & Methodology

## Phase 1 — prohibited / removed mockup elements

Do not build:
- DI Overall composite score;
- generated Hit / Power / Speed / Defense / Arm grades;
- numeric signability probability;
- athlete-specific round-by-round draft probability;
- projected bonus range with confidence percentage;
- undefined comparable-player numeric similarity score.

These concept-mockup elements are not authoritative.

## Historical base rates instead of athlete prediction

Allowed when supported by a verified dataset:

> Among X historical comparable players meeting these criteria, Y were selected in Round 1, Z in Rounds 2–3, etc.

Required:
- comparable count;
- research window;
- evidence label;
- traceable source/methodology.

## Historical bonus range

Allowed when supported:

> Among X comparable players with verified reported signing bonuses, bonuses ranged from $A to $B with a median of $C.

Do not call this an expected athlete bonus.

Do not attach a predictive confidence percentage.

## Comparable players

Show real comparable players from approved data.

Each comparable should include a plain-language rationale.

Do not show a numeric comp score until OSM approves a documented formula.

## Scouting grades

Traditional 20–80 grades may appear only when manually entered/approved by OSM and stored as OSM Proprietary Data with evaluator/date metadata.

Default Phase 1 behavior: no scouting tool grades.

## Signability

Use qualitative evidence-based analysis only.

Any signability discussion is labeled **DiamondIQ Analysis / Inference**, with supporting factors visible.

## Evidence labels

Every number/finding maps internally to:
- Verified Public Information
- OSM Proprietary Data
- OSM-Provided Athlete Information
- Calculated Results
- DiamondIQ Analysis / Inference
- Missing / Unverified Information

Make sourcing visible inline or through hover/tap and Sources & Methodology.

## Historical-context warning

> Historical results provide context, not a guaranteed draft projection. Your OSM team will interpret these findings in the context of your individual situation.

## Approval
All Page 6 reports remain hidden from athlete until Admin publishes.

# PAGE 7 — NIL INTELLIGENCE REPORT
**Status: Structure approved; production branding must use official assets**

## Purpose
Convert Page 4 research into an evidence-based NIL opportunity report.

The report is about **real opportunities**, not invented NIL valuation.

## Core tabs / sections

### Opportunity Targets
For every target:

- Organization / Business
- Industry / Category
- Why Relevant
- Evidence of Market / Athlete / Community Fit
- Verified Prior Activity — when available
- Evidence Source
- Outreach Priority
- Potential Activation
- Status of Verification

Do not display a target as “verified” unless the evidence supports that designation.

### Market Insights
Examples:
- local college-athlete activity;
- industries active in the market;
- existing university / community ecosystem;
- region-specific opportunity categories;
- known local sports/business relationships.

### Decision Makers
Display only when publicly verifiable or supplied by OSM.

Fields may include:
- name;
- title;
- organization;
- public business email;
- public business phone;
- LinkedIn/public profile;
- source.

Do not guess decision-makers.

### Activation Concepts
Examples:
- signature menu item;
- autograph/card signing;
- youth clinic;
- appearance;
- social campaign;
- community event;
- product feature;
- brand ambassador;
- co-branded promotion.

These are **recommendations**, not claims that the organization wants the deal.

### Precedent Research
Show real prior examples where verified.

### Action Plan
- recommended contact sequence;
- priority tiers;
- suggested timing;
- next OSM action.

### Research & Evidence
List:
- public sources;
- OSM proprietary intelligence;
- known limitations;
- information gaps.

## No fabricated metrics

Do not invent:
- “NIL value”;
- “marketability score”;
- undisclosed deal amount;
- average industry deal value;
- fake follower count;
- fake engagement;
- fake brand partnership;
- fake contact detail.

If a real verified metric exists, it may be shown and cited internally.

## Approval
All Page 7 reports remain hidden from athlete until Admin publishes.

---

# PAGE 8 — CLUB DRAFT / PAYMENT INTELLIGENCE REPORT
**NEW PAGE — DESIGN SPECIFICATION**

## Purpose
Turn the Club Draft Research Workspace into a detailed club-specific intelligence report.

This report should answer questions such as:
- How does this club historically use its draft picks?
- Where does it tend to allocate bonus pool?
- How often does it pay over/under slot?
- What player types have it selected in comparable ranges?
- How has behavior changed by year?
- How should OSM interpret the club's historical payment behavior?

## Header
- club name;
- official club identity only if licensed/approved asset exists;
- report date;
- research window;
- pick range;
- OSM Admin status;
- data coverage status.

## Sections

### 1. Executive Summary
Concise 3–5 point summary:
- historically observed tendencies;
- evidence strength;
- most relevant insight;
- limitations.

### 2. Draft History Overview
- picks by year;
- positions selected;
- HS vs college;
- conference / region where supported;
- pitcher vs position player split;
- pick ranges.

### 3. Payment Behavior
Only verified bonus data.

Metrics may include:
- average signed bonus by comparable pick range;
- median;
- over-slot count;
- under-slot count;
- full-slot count;
- unsigned;
- unavailable / unreported.

Always distinguish:
- reported bonus;
- slot value;
- estimated / unavailable.

### 4. Bonus Pool Allocation
When official pool data is available:
- top-10-round pool;
- pick values;
- verified spending;
- known savings;
- known overages;
- unresolved/unreported amounts.

Never assume unreported allocations.

### 5. Pick-Range Analysis
Example:
> Picks 20–60

Show:
- historical player profiles;
- bonus behavior;
- position trends;
- signability patterns when verified.

### 6. Comparable Selections
Real players only from approved datasets.

### 7. Club Comparison
Optional:
- up to three clubs;
- same metrics;
- same research window.

### 8. OSM Interpretation
Clear distinction:
> This section is OSM / DiamondIQ analysis derived from the verified historical record.

### 9. Information Gaps
If current-year bonuses or intentions are unknown:
- state what is unavailable;
- show “Additional Information Required”;
- notify OSM.

### 10. Sources & Methodology
Every key figure traceable.

## Approval
Hidden from athlete until OSM Admin publishes.

---

# PAGE 9 — MY REPORTS
**NEW PAGE — DESIGN SPECIFICATION**

## Purpose
One unified library for every athlete-facing published report and any report still pending review.

Do not create separate report libraries for Draft / NIL / Club.

## Layout

### Search
Search report title, question, market, club, year.

### Filters
- All
- Draft
- NIL
- Club
- Comparisons
- Pending Analysis
- Published

### Report cards / rows
Each report shows:
- title;
- report type;
- date generated;
- date published;
- status;
- last updated;
- short description;
- open button.

Possible statuses:
- Pending Analysis
- Published
- Updated
- Archived

### Athlete behavior
Athlete sees:
- published reports;
- pending report placeholder with no readable report content.

Admin/staff may see full internal status.

### Actions
Athlete:
- Open
- Download PDF where allowed
- Duplicate research / run updated version where allowed

Admin permissions determine whether Share is available.

---

# PAGE 10 — KNOWLEDGE CENTER
**NEW PAGE — DESIGN SPECIFICATION**

## Purpose
OSM client education library.

This should feel editorial and organized, not like a generic blog.

## Categories
Initial:

### MLB Draft
- eligibility;
- process;
- draft days;
- advisor role;
- communication with clubs.

### Signing Bonuses
- slot value;
- pool system;
- over/under slot;
- what is negotiable;
- payment structure.

### Professional Baseball
- contracts;
- minor league structure;
- MLBPA-related educational content where appropriate;
- free agency;
- arbitration basics.

### NIL & Marketing
- NIL fundamentals;
- collectives;
- appearances;
- endorsements;
- social obligations;
- compliance education.

### College / Transfer Decisions
- market considerations;
- visibility;
- opportunity ecosystem.

### OSM Education
- OSM-authored educational materials;
- proprietary guidance.

## Content controls
Admin:
- create;
- edit;
- publish;
- archive;
- assign article to client groups or individual athletes.

## Athlete experience
- featured education;
- search;
- category browsing;
- saved / recently viewed.

No public commenting or social feed.

---

# PAGE 11 — ATHLETE PROFILE
**NEW PAGE — DESIGN SPECIFICATION**

## Purpose
Central source for the athlete information used by DiamondIQ.

This is not a social profile.

## Sections

### Identity
- name;
- preferred name;
- image;
- DOB;
- hometown;
- contact information where appropriate.

### Baseball Profile
- position;
- secondary position;
- bats;
- throws;
- height;
- weight;
- current school;
- conference;
- level;
- graduation / draft year;
- draft eligibility.

### Rankings / Research Variables
Only approved sources:
- Baseball America;
- MLB Pipeline;
- Perfect Game;
- D1Baseball;
- other approved source.

Every ranking includes:
- source;
- date;
- ranking;
- last updated;
- source record.

### NIL / Marketing Profile — when enabled
- social links;
- verified analytics;
- personal interests;
- causes;
- travel preference;
- category exclusions;
- existing brand restrictions;
- availability.

### Data completeness
Show Admin and athlete what is missing.

### Permissions
The athlete may edit selected personal fields.

Critical research fields may require OSM verification.

---

# PAGE 12 — OPTIONAL NIL / MARKETING MANAGEMENT
**NEW PAGE — DESIGN SPECIFICATION**

This entire module disappears when disabled.

The module should use internal tabs rather than adding many permanent top-level pages.

## Tab 1 — Overview
- active agreements;
- upcoming obligations;
- next payment;
- next appearance;
- deliverables due.

## Tab 2 — Calendar
Calendar may include:
- collective dates;
- appearances;
- autograph/card signings;
- content deadlines;
- photo/video shoots;
- payment dates;
- agreement expirations;
- OSM meetings.

## Tab 3 — Agreements
Cards:
- brand / collective;
- term;
- status;
- compensation summary where athlete-visible;
- next obligation;
- completion progress.

### Agreement Detail
Store:
- document;
- compensation;
- deliverables;
- term;
- exclusivity;
- approval requirements;
- payment dates;
- usage rights;
- public/private notes.

Admin decides which fields are athlete-visible.

## Tab 4 — Deliverables
Statuses:
- Scheduled
- Content Needed
- Sent to Brand
- Awaiting Approval
- Approved
- Posted
- Completed

## Tab 5 — Content & Social
Optional connected social accounts.

Purpose:
help athlete execute approved OSM obligations.

Not intended to replace a professional social media management platform.

A deliverable may include:
- platform;
- required tag;
- required language;
- prohibited language;
- post window;
- brand assets.

Caption generation may be offered when context exists.

The AI must not invent contractual requirements.

---

# 9. REPORT ENGINE — COMMON TEMPLATE RULES

All three report families should feel related.

### Draft Report
historical baseball research

### NIL Report
opportunity and outreach intelligence

### Club Report
club behavior / payment intelligence

## Common report chrome
- report title;
- report ID;
- date;
- athlete;
- export;
- status;
- Admin approval state;
- evidence / methodology;
- report tabs;
- OSM context;
- footer.

Do not force identical data layouts across report types.

Each report type gets the data visualization appropriate to its evidence.

---

# 10. OSM ADMIN APPLICATION

The Admin environment is a separate experience using the same design system.

Primary Admin navigation:

- Dashboard
- Clients
- Athletes
- Report Review
- Intelligence Requests
- Data Library
- Knowledge Center
- NIL Management
- Methodology
- System

---

# ADMIN 1 — DASHBOARD

Show:
- active clients;
- reports pending review;
- Intelligence Requests;
- upcoming athlete obligations;
- incomplete datasets;
- system/data health;
- recent uploads.

Prioritize:
**Needs Attention**

---

# ADMIN 2 — CLIENT ACCESS

Table:
- athlete;
- user;
- status;
- last login;
- enabled modules;
- actions.

Actions:
- create;
- suspend;
- reset;
- deactivate;
- delete;
- assign feature access.

---

# ADMIN 3 — ATHLETES

Manage structured athlete profile.

Admin may:
- verify fields;
- lock fields;
- update rankings;
- add internal notes;
- attach source;
- set NIL management eligibility.

---

# ADMIN 4 — REPORT REVIEW

This is a **mode / workflow**, not a separate client page.

Queue:
- report;
- athlete;
- type;
- generated time;
- flags;
- missing info;
- reviewer;
- status.

Inside report:
- full internal report;
- Keep;
- Edit;
- Replace;
- Hide;
- 2–3 suggested replacements when valid;
- internal notes;
- Publish.

---

# ADMIN 5 — INTELLIGENCE REQUESTS

DiamondIQ creates a request when missing information could materially affect accuracy.

Fields:
- athlete;
- report;
- question;
- missing data;
- why it matters;
- recommended action;
- priority;
- status.

Admin responses:

### Add Information
Enter verified information.

### Upload Source
Attach approved document/data.

### Provide Instruction
Teach DiamondIQ how to handle the issue.

### Remove Section
Exclude unsupported analysis.

### Scope of instruction
Admin chooses:
- This Report Only
- This Athlete
- This Dataset
- All DiamondIQ Reports

Never silently convert a one-off instruction into a global rule.

---

# ADMIN 6 — DATA LIBRARY

Google Drive `DiamondIQ` folder is the human-controlled source archive.

DiamondIQ's application database stores the structured application-ready data.

Do not hard-code application logic to individual Drive file names.

## Upload types
- XLSX
- CSV
- PDF
- DOCX

Future:
- direct Google Drive ingestion.

## Categories

### Draft
- draft results;
- bonuses;
- slot values;
- rankings;
- schools;
- conferences;
- teams;
- career outcomes.

### Club
- draft history;
- pool;
- payments;
- player types;
- regional/pipeline research.

### NIL
- market research;
- businesses;
- verified partnerships;
- contacts;
- outreach history;
- opportunities;
- school/collective ecosystem.

### OSM
- proprietary research;
- client history;
- methodologies;
- educational materials.

## Dataset metadata
- title;
- category;
- source;
- years covered;
- upload date;
- last updated;
- record count;
- processing status;
- confidence/completeness;
- reports/features using it.

---

# ADMIN 7 — INTELLIGENCE HEALTH

Show data quality/freshness by major category.

Examples:
- MLB Draft Results
- Signing Bonuses
- Slot Values
- Rankings
- Club Draft History
- Current-Year Bonuses
- NIL Market Research
- Verified Partnerships
- Decision-Maker Data

Possible states:
- Strong
- Moderate
- Limited
- Incomplete
- Needs Update

Do not use a confidence score merely for decoration.

---

# ADMIN 8 — NIL MANAGEMENT

For athletes with NIL / marketing management enabled.

Agency-wide views:
- obligations this week;
- deliverables due;
- brand approvals;
- appearances;
- card signings;
- payments expected;
- expiring agreements.

Agreement upload should allow:
- document storage;
- extraction suggestion;
- Admin confirmation before facts become active.

Never treat uncertain automated extraction as verified until approved.

---

# ADMIN 9 — METHODOLOGY

OSM Admin can manage approved analytical rules.

Examples:
- when to use reported bonus vs slot;
- ranking-source precedence;
- missing-data treatment;
- confidence language;
- research methodology.

Every rule should have:
- title;
- scope;
- version;
- effective date;
- author;
- notes.

---

# 11. NIL INTELLIGENCE RESEARCH METHODOLOGY

DiamondIQ NIL research should follow the type of opportunity research demonstrated in OSM's Gavin Gallagher / UNC work.

The system should systematically research:

1. Athlete context
2. School context
3. Local market
4. Regional market
5. Existing NIL infrastructure
6. Collectives / marketplaces / donor ecosystem
7. Independent local businesses
8. Sports-specific businesses
9. Relevant brand categories
10. Real athlete/business precedent
11. Public decision-makers
12. Practical deal concepts
13. Outreach priority
14. Timing
15. Evidence
16. Missing information

Example target hierarchy:
- proven local business interest;
- Franklin Street / school-area businesses;
- regional baseball academies;
- card/memorabilia;
- equipment retailers;
- grooming;
- gyms;
- automotive;
- healthcare;
- restaurants;
- financial services;
- community organizations.

Do not assume a category is appropriate for every athlete.

Use athlete-specific restrictions and interests.

---

# 12. DATA PROVENANCE

Every fact shown in a report should be traceable internally.

Minimum provenance fields:
- source type;
- source title;
- source URL/file;
- access/upload date;
- structured dataset record if applicable;
- OSM verification status.

The athlete does not necessarily need to see every raw internal source, but OSM must be able to audit it.

---

# 13. GOOGLE DRIVE ROLE

Recommended Drive structure:

`DiamondIQ/`

- `01 Brand & Visual Identity`
- `02 Product Design`
- `03 Draft Intelligence Data`
- `04 NIL & Market Intelligence`
- `05 OSM Proprietary Research`
- `06 Reports & Examples`
- `07 Development`
- `99 Archive`

Drive is:
**source archive**

DiamondIQ database is:
**structured intelligence**

GitHub is:
**design/build specification + code**

Replit is:
**implementation environment**

---

# 14. RECOMMENDED GITHUB STRUCTURE

```text
diamondiq/
├── README.md
├── docs/
│   ├── DIAMONDIQ_MASTER_SPEC.md
│   ├── DATA_MODEL.md
│   ├── AI_BEHAVIOR.md
│   ├── REPORT_REVIEW_WORKFLOW.md
│   └── DATA_INGESTION.md
├── assets/
│   ├── branding/
│   │   ├── toc-sports-logo.svg
│   │   ├── toc-sports-logo.png
│   │   ├── diamondiq-wordmark.svg
│   │   └── diamondiq-heatmap-mark.svg
│   └── references/
│       ├── page-01-home.png
│       ├── page-02-ask.png
│       ├── page-03-draft-workspace.png
│       ├── page-04-nil-workspace.png
│       ├── page-05-club-workspace.png
│       ├── page-06-draft-report.png
│       └── page-07-nil-report.png
├── src/
├── database/
└── scripts/
```

---

# 15. REPLIT MASTER IMPLEMENTATION INSTRUCTION

Use the following as the controlling instruction to Replit:

> Build DiamondIQ as a private O'Connell Sports Management / TOC Sports client intelligence platform according to `docs/DIAMONDIQ_MASTER_SPEC.md`.
>
> The specification and supplied official assets are authoritative.
>
> Do not invent additional modules, duplicate existing workflows, alter the visual identity, fabricate data, or generate replacement logos.
>
> Research modes are not separate permanent pages unless explicitly defined in the specification.
>
> Report review is a state/workflow, not a duplicate client page.
>
> Scenarios are functions inside the relevant intelligence engine, not a separate top-level product.
>
> The TOC Sports logo must only be loaded from the official asset file supplied in the repository. Never recreate it. If the asset cannot load, render no TOC logo.
>
> Every report is internal and unpublished by default. No athlete may access readable report content until OSM Admin explicitly publishes it.
>
> DiamondIQ must follow the Evidence-First AI Standard. It must never fabricate a fact or silently fill missing information. When evidence is insufficient, it must create an Intelligence Request for OSM Admin.
>
> Do not create fake NIL valuations, fake contacts, fake partnership history, fake reported bonuses, or fake club strategy.
>
> Build the interface using the approved DiamondIQ dark navy/charcoal/teal system. Preserve the layout hierarchy and restraint shown in the approved reference screens.
>
> All athlete data, report content, contacts, brand relationships, and OSM proprietary information must be isolated and permission-controlled.
>
> Build in incremental stages and do not redesign completed screens without explicit instruction.

---


### Addendum v1 implementation requirements

Before building client navigation or the Draft Intelligence Report:
- read `DIAMONDIQ_ADDENDUM_v1_NAV_AND_DRAFT_REPORT.md`;
- treat it as authoritative over conflicting mockups;
- remove Scenarios from client navigation;
- do not show Intelligence Requests in client navigation;
- use the same canonical left rail on every client page;
- implement the Phase 1 Draft Report without unsupported predictive/composite scores;
- never infer formulas from mockup appearance.


# 16. IMPLEMENTATION ORDER

## Phase 1 — Foundation
1. Brand assets
2. Design tokens
3. Authentication
4. Roles
5. Feature toggles
6. Athlete records

## Phase 2 — Client shell
7. Navigation
8. Page 1 Home
9. Page 2 Ask DiamondIQ

## Phase 3 — Intelligence workspaces
10. Page 3 Draft Workspace
11. Page 4 NIL Workspace
12. Page 5 Club Workspace

## Phase 4 — Report engine
13. Common report framework
14. Page 6 Draft Report
15. Page 7 NIL Report
16. Page 8 Club Report
17. Pending Analysis athlete state
18. Admin Review / Keep-Edit-Replace-Hide
19. Publish workflow

## Phase 5 — Client support
20. Page 9 My Reports
21. Page 10 Knowledge Center
22. Page 11 Athlete Profile
23. Page 12 NIL Management

## Phase 6 — Admin
24. Admin Dashboard
25. Clients
26. Athletes
27. Report Review
28. Intelligence Requests
29. Data Library
30. Knowledge Center
31. NIL Management
32. Methodology
33. System

## Phase 7 — Data
34. Spreadsheet ingestion
35. PDF/DOCX ingestion
36. provenance
37. data health
38. future Drive integration

---

# 17. ACCEPTANCE TESTS

The app is not ready if any of the following fail.

## Branding
- Is the only TOC Sports logo the official asset?
- Is there zero generated/fabricated TOC artwork?
- Is the DiamondIQ identity the approved identity?
- Is there no duplicate branding?

## Navigation
- Are research modes contained inside workspaces rather than duplicated as pages?
- Are report review states not shown as duplicate client pages?
- Does NIL Management disappear when disabled?

## Evidence
- Can every factual claim be traced internally?
- Does missing data trigger an Intelligence Request?
- Does the AI refuse to guess?

## Reports
- Are new reports unreadable to athlete before Admin publication?
- Can Admin Keep / Edit / Replace / Hide?
- Is Hide always available?
- Are replacement alternatives shown only when supportable?
- Does Admin retain full internal report history?

## NIL
- Are opportunities research-based?
- Are contacts real and sourced?
- Are activation ideas labeled as recommendations?
- Are unverified deal amounts absent?

## Draft
- Are historical results separated from projection?
- Are bonuses clearly distinguished from slot values?
- Are comparables real dataset records?

## Club
- Are unreported bonuses shown as unavailable rather than estimated?
- Are historical tendencies labeled as historical, not current intent?


### Navigation addendum tests
- Is Scenarios absent from every client nav?
- Are the three intelligence nav labels identical on every client screen?
- Is Intelligence Requests absent from client nav?
- Do optional My OSM items hide correctly by feature toggle?

### Draft Report evidence tests
- Is there no DI Overall score in Phase 1?
- Are there no generated 20–80 tool grades?
- Is there no athlete-specific signability percentage?
- Are there no athlete-specific round probabilities?
- Is the bonus range explicitly historical and based on verified comparables?
- Are numeric comp scores absent?
- Can every displayed number reveal its evidence classification and source/methodology?


## Security
- Does an athlete see only their own information?
- Does OSM control access?
- Are Admin-only notes hidden from athlete?

---

# 18. PRODUCT PRINCIPLE

DiamondIQ should make OSM intelligence more accessible without making OSM replaceable.

The product should always reinforce:

> **Evidence first. Athlete first. OSM interpretation always matters.**

And:

> **You have access to this intelligence because you are represented by O'Connell Sports Management.**
