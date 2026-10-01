---
title: De opdrachtregel
category: Werkruimtegereedschap
order: 93
summary: `geminio .` opent een repository — en `geminio doctor` antwoordt zonder iets te openen.
keywords: cli opdrachtregel commandoregel terminal shim path installeren openen map enkele instantie doctor status repos commit-check config editor completions wait core.editor blame show search werkwoorden exitcode ci hook
---

# De opdrachtregel

Vanuit een terminal stel je twee soorten vragen, en `geminio` beantwoordt ze
allebei.

De eerste is *“laat me dit zien”* — je zit in een kloon, er moet iets bekeken
worden, en de app is de juiste plek om ernaar te kijken. Zulke aanroepen openen
een venster, zo dicht mogelijk bij waar je naar vroeg.

De tweede is *“zeg het nu”* — een hook, een CI-taak, of jijzelf, midden in een
pipe, die een antwoord en een exitcode wil in plaats van een venster. Die starten
de app nooit: ze schrijven naar stdout en gaan uit de weg.

```sh
geminio .                        # open deze map
geminio blame src/api.ts -l 84   # …bij de blame van die regel
geminio doctor                   # geen venster: controleert de repo, exit 1 bij falen
```

## Installeren

Opdrachtenpalet (<kbd>⌘K</kbd>) → **Installeer het 'geminio'-commando in PATH**.
Op macOS wordt een kleine shim gelinkt in `/usr/local/bin` of
`/opt/homebrew/bin`, en worden beheerdersrechten alleen gevraagd als geen van
beide voor jou schrijfbaar is. Op Linux gaat hij naar `~/.local/bin`, waarvoor
helemaal geen rechten nodig zijn. Hetzelfde commando verwijdert hem weer. Windows
wordt nog niet ondersteund.

Daarna, desgewenst:

```sh
geminio completions zsh >> ~/.zshrc     # of bash, of fish
```

## Dingen openen

| Commando | Opent |
|----------|-------|
| `geminio [pad]` | De repository (standaard: de huidige map) |
| `geminio open <naam>` | Een repository op **tabbladnaam** — `geminio open api` |
| `geminio diff` | De wijzigingen in de werkkopie |
| `geminio graph` | De commitgrafiek |
| `geminio show <ref>` | Eén commit — `HEAD~2`, een tag, een korte hash |
| `geminio blame <bestand>` | Blame voor een bestand; met `-l 84` land je op een regel |
| `geminio search <zoekterm>` | Codezoeken, met de zoekterm al ingevuld |
| `geminio stack`, `stash`, `reflog`, `conflicts`, `todos`, `chat`, `settings` | Dat paneel |
| `geminio ci`, `clean`, `bisect`, `absorb`, `snapshots`, `insights`, `terminal` | …enzovoort |

`geminio help verbs` toont de volledige lijst. Drie opties gelden voor allemaal:
`-n <naam>` zet de weergegeven tabbladnaam, `-g <groep>` plaatst het in een
groepstabblad (dat zo nodig ontstaat), en `-l <n>` kiest een regel.

Geminio draait als **enkele instantie**: `geminio` uitvoeren terwijl de app open
staat, geeft het verzoek door aan dat venster in plaats van een tweede kopie te
starten. Een pad dat al open is — als tabblad of binnen een groep — krijgt
**focus**, geen duplicaat. Een map die nog geen repository is, opent alsnog en
biedt “repository hier initialiseren” aan.

## Antwoorden in de terminal

Deze printen en stoppen. Er opent geen venster, en de app hoeft niet eens te
draaien.

### `geminio status`

Branch, tracking, voor/achter, werkkopie, stashes en — als de repository er een
meelevert — de [pushchecklist uit `.geminio.json`](repo-config.md). Exit 1
wanneer de werkkopie conflicten heeft, dus `geminio status || echo geblokkeerd`
werkt.

### `geminio doctor [--fix]`

Voert dezelfde controles uit als het paneel voor
[repositoryconfiguratie](repo-config.md): de Node-versie, submodules, LFS,
`core.hooksPath`, vereiste bestanden. **Exit 1 als een controle faalt**, en dat
is het hele punt — de regels die een repository verklaart zijn weinig waard als
alleen degene met de interface open ze ooit ziet:

```yaml
- run: geminio doctor          # in CI, vóór alles wat duur is
```

`--fix` past de reparaties toe die de dokter kent (submodules initialiseren,
`lfs pull`, `core.hooksPath` zetten, een bestand vanuit zijn voorbeeld kopiëren)
en controleert opnieuw. Hij voert nooit een commando uit dat de configuratie
aanleverde — de verzameling reparaties is gesloten.

Waarschuwingen laten de run niet falen. Een waarschuwing betekent dat de dokter
iets niet kon vaststellen, niet dat er iets mis is, en builds daarop laten falen
zou het bestand te duur maken om in te voeren.

### `geminio commit-check [bestand]`

Controleert een commitbericht. Zonder argument leest het `.git/COMMIT_EDITMSG`;
`-m "…"` controleert een tekst. Het weet wat de repository verklaarde: een
onbekende scope is een **fout** wanneer `.geminio.json` scopes opsomt, en louter
stijladvies wanneer niet. Hang het in een hook:

```sh
# .husky/commit-msg
geminio commit-check "$1"
```

### `geminio config init | show | check`

`init` leest de repository en stelt een `.geminio.json` voor op basis van wat er
al is — `.nvmrc`, `.gitmodules`, een `.env.example` zonder `.env`, de
commit-scopes die de geschiedenis gebruikt. `--dry-run` print in plaats van te
schrijven. `show` toont het huidige bestand; `check` valideert het en somt elk
veld op dat zou wegvallen.

### `geminio repos [filter]`

Elke repository die Geminio kent — open tabbladen eerst, dan de recente — met de
groep. `--paths` print kale paden, één per regel, om te scripten:

```sh
cd "$(geminio repos --paths api | head -1)"
```

## Geminio als editor van git

```sh
geminio editor install
```

zet `core.editor` en `sequence.editor` op `geminio --wait`. Vanaf dan openen
`git commit` (zonder `-m`), `git commit --amend`, `git tag -a` en
`git rebase -i` hun bestand in Geminio in plaats van vim, met een tellertje en
dezelfde hints over het commitbericht als de composer toont.

![De editor die Geminio opent wanneer git erom vraagt](../../screenshots/cli-edit.webp)

Het woord dat telt is **wacht**: git hangt aan dat dialoogvenster. Dus

- **Opslaan en doorgaan** schrijft het bestand terug en git gaat verder.
- **Annuleren** schrijft een leeg bestand, wat git leest als *afbreken*.
- Het venster op een andere manier sluiten — Escape, de achtergrond, Geminio
  afsluiten — telt als Annuleren. Een terminal die eeuwig wacht zou veel erger
  zijn dan een bericht dat je opnieuw moet typen.

Voeg `--local` toe om het tot één repository te beperken, en draai het terug met
`geminio editor uninstall`.

## Wat het niet doet

- **Geen enkel terminalwerkwoord wijzigt de repository.** `doctor --fix` is de
  enige uitzondering, en zijn reparaties zijn een vaste lijst die geen
  configuratiebestand kan uitbreiden.
- **`repos` leest alleen.** De draaiende app bezit haar instellingenbestand; de
  CLI leest het en schrijft het nooit.
- **Een werkwoord dat de geïnstalleerde app niet kent, wordt genegeerd**, niet
  geweigerd — een nieuwere shim opent bij een oudere app alsnog de repository.
- **Windows heeft nog geen shim.** De werkwoorden zijn allemaal geïmplementeerd;
  alleen het installatiepad ontbreekt.

**Zie ook:** [Werkruimtes, tabbladen en groepen](workspaces.md) ·
[Repositoryconfiguratie](repo-config.md) · [Committen](committing.md)
