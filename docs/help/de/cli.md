---
title: Die Kommandozeile
category: Arbeitsbereich-Werkzeuge
order: 93
summary: `geminio .` öffnet ein Repository — und `geminio doctor` antwortet, ohne etwas zu öffnen.
keywords: cli kommandozeile terminal shim path installieren öffnen ordner einzelinstanz doctor status repos commit-check config editor completions wait core.editor blame show search verben exitcode ci hook
---

# Die Kommandozeile

Aus einem Terminal werden zwei Arten von Fragen gestellt, und `geminio`
beantwortet beide.

Die erste lautet *„zeig mir das“* — du bist in einem Klon, etwas will angesehen
werden, und die App ist der richtige Ort dafür. Solche Aufrufe öffnen ein
Fenster, so nah wie möglich an dem, wonach du gefragt hast.

Die zweite lautet *„sag es mir jetzt“* — ein Hook, ein CI-Job oder du selbst,
mitten in einer Pipe, mit dem Wunsch nach einer Antwort und einem Exitcode statt
eines Fensters. Diese starten die App nie: sie schreiben auf stdout und gehen aus
dem Weg.

```sh
geminio .                        # diesen Ordner öffnen
geminio blame src/api.ts -l 84   # …beim Blame dieser Zeile
geminio doctor                   # kein Fenster: prüft das Repo, Exit 1 bei Fehlern
```

## Installieren

Befehlspalette (<kbd>⌘K</kbd>) → **'geminio'-Befehl im PATH installieren**. Unter
macOS wird ein kleiner Shim nach `/usr/local/bin` oder `/opt/homebrew/bin`
verlinkt; Administratorrechte werden nur verlangt, wenn keines von beiden für
dich schreibbar ist. Unter Linux landet er in `~/.local/bin` und braucht gar
keine Rechte. Derselbe Befehl deinstalliert ihn wieder. Windows wird noch nicht
unterstützt.

Danach, optional:

```sh
geminio completions zsh >> ~/.zshrc     # oder bash, oder fish
```

## Dinge öffnen

| Befehl | Öffnet |
|--------|--------|
| `geminio [pfad]` | Das Repository (Standard: das aktuelle Verzeichnis) |
| `geminio open <name>` | Ein Repository über seinen **Tab-Namen** — `geminio open api` |
| `geminio diff` | Die Arbeitskopie-Änderungen |
| `geminio graph` | Den Commit-Graphen |
| `geminio show <ref>` | Einen Commit — `HEAD~2`, ein Tag, ein kurzer Hash |
| `geminio blame <datei>` | Blame für eine Datei; mit `-l 84` direkt zur Zeile |
| `geminio search <suche>` | Die Codesuche, Suchbegriff bereits eingetragen |
| `geminio stack`, `stash`, `reflog`, `conflicts`, `todos`, `chat`, `settings` | Dieses Panel |
| `geminio ci`, `clean`, `bisect`, `absorb`, `snapshots`, `insights`, `terminal` | …und so weiter |

`geminio help verbs` gibt die vollständige Liste aus. Drei Optionen gelten für
alle: `-n <name>` setzt den angezeigten Tab-Namen, `-g <gruppe>` legt es in einen
Gruppen-Tab (der bei Bedarf entsteht), und `-l <n>` wählt eine Zeile.

Geminio ist eine **Einzelinstanz**: `geminio` bei geöffneter App reicht die
Anfrage an dieses Fenster weiter, statt eine zweite Kopie zu starten. Ein bereits
geöffneter Pfad — als Tab oder in einer Gruppe — wird **fokussiert**, nicht
dupliziert. Ein Verzeichnis, das noch kein Repository ist, öffnet trotzdem und
bietet „Repository hier initialisieren“ an.

## Im Terminal antworten

Diese geben aus und beenden sich. Es öffnet sich kein Fenster, und die App muss
nicht einmal laufen.

### `geminio status`

Branch, Tracking, Vorsprung/Rückstand, Arbeitskopie, Stashes und — falls das
Repository sie mitbringt — die [Push-Checkliste aus
`.geminio.json`](repo-config.md). Exit 1, wenn die Arbeitskopie Konflikte hat,
also funktioniert `geminio status || echo blockiert`.

### `geminio doctor [--fix]`

Führt dieselben Prüfungen aus wie das Panel für die
[Repository-Konfiguration](repo-config.md): Node-Version, Submodule, LFS,
`core.hooksPath`, benötigte Dateien. **Exit 1, wenn eine Prüfung fehlschlägt** —
genau darum geht es: Regeln, die ein Repository deklariert, sind wenig wert, wenn
nur die Person mit offener Oberfläche sie je sieht:

```yaml
- run: geminio doctor          # in der CI, vor allem Teuren
```

`--fix` wendet die Reparaturen an, die der Doktor kennt (Submodule
initialisieren, `lfs pull`, `core.hooksPath` setzen, eine Datei aus ihrem
Beispiel kopieren), und prüft erneut. Er führt nie einen Befehl aus, den die
Konfiguration geliefert hat — der Satz an Reparaturen ist geschlossen.

Warnungen lassen den Lauf nicht scheitern. Eine Warnung heißt, dass der Doktor
etwas nicht feststellen konnte, nicht dass etwas falsch ist; Builds daran
scheitern zu lassen, machte die Datei zu teuer in der Anschaffung.

### `geminio commit-check [datei]`

Prüft eine Commit-Nachricht. Ohne Argument liest sie `.git/COMMIT_EDITMSG`;
`-m "…"` prüft eine Zeichenkette. Sie weiß, was das Repository deklariert hat:
ein unbekannter Scope ist ein **Fehler**, wenn `.geminio.json` Scopes auflistet,
und sonst bloß ein Stilhinweis. In einen Hook einbauen:

```sh
# .husky/commit-msg
geminio commit-check "$1"
```

### `geminio config init | show | check`

`init` liest das Repository und schlägt eine `.geminio.json` aus dem vor, was
ohnehin schon da ist — `.nvmrc`, `.gitmodules`, ein `.env.example` ohne `.env`,
die Commit-Scopes, die die Historie verwendet. `--dry-run` gibt aus, statt zu
schreiben. `show` druckt die aktuelle Datei; `check` validiert sie und listet
jedes Feld auf, das verworfen würde.

### `geminio repos [filter]`

Jedes Repository, das Geminio kennt — offene Tabs zuerst, dann die zuletzt
benutzten — mit seiner Gruppe. `--paths` gibt nackte Pfade aus, einen pro Zeile,
zum Skripten:

```sh
cd "$(geminio repos --paths api | head -1)"
```

## Geminio als Editor von git

```sh
geminio editor install
```

setzt `core.editor` und `sequence.editor` auf `geminio --wait`. Ab dann öffnen
`git commit` (ohne `-m`), `git commit --amend`, `git tag -a` und `git rebase -i`
ihre Datei in Geminio statt in vim, mit Zeichenzähler und denselben Hinweisen
zur Commit-Nachricht wie im Composer.

![Der Editor, den Geminio öffnet, wenn git einen verlangt](../../screenshots/cli-edit.webp)

Entscheidend ist das Wort **wartet**: git hängt an diesem Dialog. Also

- **Speichern & fortfahren** schreibt die Datei zurück, und git macht weiter.
- **Abbrechen** schreibt eine leere Datei, was git als *Abbruch* liest.
- Den Dialog anders zu schließen — Escape, der Hintergrund, Geminio beenden —
  zählt als Abbrechen. Ein Terminal, das ewig wartet, wäre weit schlimmer als
  eine Nachricht, die man neu tippen muss.

`--local` beschränkt es auf ein Repository, `geminio editor uninstall` macht es
rückgängig.

## Was sie nicht tut

- **Kein Terminal-Verb verändert das Repository.** `doctor --fix` ist die einzige
  Ausnahme, und seine Reparaturen sind eine feste Liste, die keine
  Konfigurationsdatei erweitern kann.
- **`repos` liest nur.** Die laufende App besitzt ihre Einstellungsdatei; die CLI
  liest sie und schreibt sie nie.
- **Ein Verb, das die installierte App nicht kennt, wird ignoriert**, nicht
  abgelehnt — ein neuerer Shim öffnet auf einer älteren App trotzdem das
  Repository.
- **Für Windows gibt es noch keinen Shim.** Die Verben sind alle implementiert;
  nur der Installationsweg fehlt.

**Siehe auch:** [Arbeitsbereiche, Tabs und Gruppen](workspaces.md) ·
[Repository-Konfiguration](repo-config.md) · [Committen](committing.md)
