# Stellaris Tech Tree — project handover

Dit bestand wordt automatisch ingelezen door elke Claude Code-sessie die in
`D:\Projects\Stellaris` start. Het documenteert alles wat nodig is om het werk
van de vorige sessies (Claude Fable 5, juli 2026) voort te zetten.
De gebruiker (Linda) is geen programmeur en heeft beperkte GitHub-kennis:
leg uit in begrijpelijk Nederlands, doe het werk zelf, verifieer alles
end-to-end in de browser voordat je iets "klaar" noemt, en commit/push per
werkend geheel.

## Wat dit project is

Twee GitHub-forks (account **LindaKuiper**, `gh` CLI is geauthenticeerd):

1. **stellaris-technology** (`D:\Projects\Stellaris\stellaris-technology`)
   Java/Maven/ANTLR-parser die Stellaris-gamebestanden leest en JSON genereert.
2. **stellaris-tech-tree** (`D:\Projects\Stellaris\stellaris-tech-tree`)
   Statische jQuery-site (geen build-stap) die die JSON toont als interactieve
   tech-bomen. Één map per gameversie; nieuwste: `pegasus-4.4.6/`.

Live op **https://lindakuiper.github.io/stellaris-tech-tree/** (GitHub Pages
vanaf master-root, herbouwt automatisch bij elke push) en lokaal op
**http://localhost/stellaris/** (WAMP-alias `C:\wamp64\alias\stellaris.conf`;
Apache-service heet `wampapache64`; mod_headers staat aan en de alias stuurt
no-cache voor html/js/json/css). Game-installatie:
`C:\Games\Steam\steamapps\common\Stellaris` (versie: Pegasus v4.4.6).

## Toolchain (staat NIET op PATH — zet per shell-aanroep)

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-11.0.31.11-hotspot"
$env:Path = "$env:JAVA_HOME\bin;D:\Projects\Stellaris\tools\apache-maven-3.9.9\bin;$env:Path"
```
Java 11 verplicht. ANTLR-tool: `D:\Projects\Stellaris\tools\antlr-4.7.1-complete.jar`.
Python 3.9 + Pillow beschikbaar (voor DDS→PNG-iconen en JSON-verificatie).

## Kernworkflow: nieuwe gameversie verwerken

1. Kopieer uit de game `common/{technology,scripted_variables,scripted_triggers,
   starbase_buildings,armies,component_templates,edicts,buildings,
   strategic_resources,starbase_modules,policies,decisions,ship_sizes,
   megastructures}` en `localisation/english/*.yml` naar
   `stellaris-technology/files/` (gitignored).
2. Draai vanaf de repo-root: `mvn compile exec:java -Dexec.mainClass=net.turanar.stellaris.App`
   → schrijft `output/*.json` + `output/empire_options.json`.
3. Kopieer physics/society/engineering/anomalies/empire_options.json naar een
   nieuwe versiemap in de site-repo; voeg een route toe in site `index.html`
   (routes-array; `author:`-veld voor de makervermelding) en maak een
   redirect-`index.html` in de versiemap (kopieer van pegasus-4.4.6).
4. Converteer ontbrekende tech-iconen DDS→PNG 52×52 (Pillow; indexeer base- +
   dlc-`gfx/interface/icons/technologies/*.dds`; respecteer `icon =`-overrides
   in tech-blokken; pas op dat de regex niet `inherit_icon` matcht).
5. Verwacht nieuwe 4.x-syntax-verrassingen: itereer op parserfouten zoals
   gedocumenteerd in de git-history van stellaris-technology.

## Kritieke eigenaardigheden (leer van onze fouten)

**Parser (stellaris-technology):**
- Na ANTLR-regeneratie (alleen nodig als `Stellaris.g4` wijzigt):
  `java -jar ...antlr-4.7.1-complete.jar -package net.turanar.stellaris.antlr
  -visitor -o src\main\java\net\turanar\stellaris\antlr Stellaris.g4`
  en daarna **handmatig `public String key() { return BAREWORD().getText(); }`
  terugzetten** in PairContext in StellarisParser.java — regeneratie wist die.
- `weight_rules`/`potential_rules` (conditie-bomen voor de Empire-feature)
  moeten **index-uitgelijnd** blijven met de arrays `weight_modifiers`/
  `potential` (RuleBuilder.java itereert dezelfde lijsten — houd dat zo).
- Alles UTF-8 (pom heeft sourceEncoding; JSON-writes gebruiken
  StandardCharsets.UTF_8). Niet-ASCII in Java-strings alleen als \uXXXX.
- .NET-methodes in PowerShell ([System.IO.File]::…) volgen Set-Location NIET —
  gebruik absolute paden.

**Site (stellaris-tech-tree):**
- **Versiebump verplicht** bij elke asset-wijziging: `assets_version` in
  root-`index.html` ophogen (formaat `20260713u` → dagdatum + letter). Het
  versienummer is zichtbaar rechtsonder op de site (#site-version).
- De boom gebruikt onzichtbare Treant **pseudo-nodes** voor tier-kolommen;
  tech-tracking.js én Treant.js (vendor, gepatcht!) lopen daar doorheen
  (parents, children, connectors incl. `lineThroughMe`). Overal `tech.pseudo`
  checken bij het lopen door nodes.
- Script-laadvolgorde in root-index.html is bewust: header.js → empire-config.js
  → tech-tracking.js → tech-tree.js → empire-page.js/empire-eval.js (onload-
  geketend). CSS-valkuil: ID-selectors verslaan `.float-NoDisplay` — gebruik
  `:not(.float-NoDisplay)` bij display-regels op containers.
- Empire-feature: `empire-config.js` (localStorage-key `empireConfig`,
  window.EmpireConfig API), `empire-page.js` (formulier), `empire-eval.js`
  (drie-waardige evaluatie: waar/onwaar/onbekend). Lege formulier-secties
  tellen als "niet gespecificeerd" (onbekend), DLC's en tech-vinkjes zijn
  altijd concreet. Engine is inactief zolang localStorage geen `empireConfig`
  heeft — baseline-site moet dan pixel-identiek zijn.
- Meldingen via `showToast(msg, isError)` (tech-tracking.js), nooit alert().
- Testen: Playwright MCP tegen http://localhost/stellaris/?pegasus-4.4.6, met
  CDP `Network.setCacheDisabled` vóór page.goto. Let op: window.confirm in
  page.evaluate deadlockt de tool — Clear All heeft een confirm.

## Werkafspraken met Linda

- Commits in het Engels, met `Co-Authored-By: <modelnaam> <noreply@anthropic.com>`
  en `git -c user.name="LindaKuiper"`. Direct op master. Push na verificatie.
- GitHub-issues: zij maakt ze aan (of vraagt erom); oppakken met `gh issue view`,
  fixen, committen met `Fixes #N` (sluit automatisch), afsluitende comment erop.
- Grote features: eerst uitwerken + verdiepende vragen stellen, dan pas bouwen;
  eventueel subagents met specs (zie scratchpad-specs in eerdere sessie als
  voorbeeld van granulariteit).
- Screenshots die zij maakt staan los in `D:\Projects\Stellaris\` — nooit
  meecommitten.

## Openstaand

- Issue #1 op stellaris-technology: `has_country_flag` rendert de rauwe
  flag-key ("Has the has_market_access country flag") — nog niet opgelost.
- `jobs/`-functionaliteit is verwijderd; oude versiemappen (orion e.d.) zijn
  bevroren erfgoed van turanar — niet aankomen.
