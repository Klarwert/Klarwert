# Klarwert – Installationsanleitung

Diese Anleitung richtet sich an alle, die **keine Programmier-Erfahrung** haben. Sie erklärt Schritt für Schritt, wie du Klarwert auf deinem Mac einrichtest und startest.

Klarwert ist eine **rein lokale** App: Es gibt kein Konto, kein Internet, keine Cloud. Alle deine Daten bleiben ausschließlich auf deinem Computer.

---

## Variante A: Fertige App verwenden (empfohlen)

Falls dir eine fertige Installationsdatei zur Verfügung gestellt wurde:

- **macOS:** Öffne die Datei mit der Endung `.dmg`, ziehe das Klarwert-Symbol in den Ordner „Programme" (Applications). Danach findest du Klarwert wie jede andere App im Launchpad oder Finder.

Da die App aktuell nicht mit einem offiziellen Apple-Entwicklerzertifikat signiert ist, zeigt macOS beim ersten Öffnen eventuell eine Warnung („Klarwert kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann"). So öffnest du die App trotzdem:

1. Rechtsklick (oder zwei Finger auf dem Trackpad) auf das Klarwert-Symbol im Programme-Ordner.
2. „Öffnen" wählen.
3. Im erscheinenden Dialog erneut „Öffnen" bestätigen.

Das ist nur beim allerersten Start nötig.

Wenn du diese Variante nutzen kannst, kannst du den Rest dieser Anleitung überspringen und direkt zu **„Erste Schritte in der App"** weiter unten gehen.

---

## Variante B: App selbst aus dem Quellcode bauen

Falls dir keine fertige Installationsdatei vorliegt, sondern nur dieser Projektordner, folge diesen Schritten. Es sieht nach vielen Schritten aus, ist aber reines Copy-Paste – du musst den Inhalt der grauen Kästen nicht verstehen, nur abtippen bzw. einfügen.

### Voraussetzung: Terminal öffnen

Das „Terminal" ist ein Programm, mit dem man dem Mac Befehle als Text gibt.

1. Drücke `Cmd + Leertaste`, tippe „Terminal" und drücke Enter.
2. Ein schwarzes oder weißes Fenster mit Text öffnet sich – das ist das Terminal.

Alle folgenden grauen Kästen sind Befehle. Du kopierst sie (markieren, `Cmd + C`), klickst ins Terminal-Fenster und fügst sie ein (`Cmd + V`), dann drückst du **Enter**. Warte, bis der Befehl fertig ist (der Cursor blinkt wieder am Zeilenanfang), bevor du den nächsten eingibst.

### Schritt 1: Node.js installieren

Node.js ist eine Basis-Software, die Klarwert zum Bauen braucht.

1. Öffne [https://nodejs.org](https://nodejs.org) in deinem Browser.
2. Lade die empfohlene Version herunter (großer grüner Button, „LTS").
3. Öffne die heruntergeladene Datei und folge dem Installationsassistenten (immer „Weiter"/„Fortfahren" klicken).

Prüfen, ob es geklappt hat – gib im Terminal ein:

```
node -v
```

Es sollte eine Versionsnummer erscheinen (z. B. `v22.0.0`). Falls stattdessen „command not found" kommt, starte den Mac einmal neu und versuche es erneut.

### Schritt 2: Rust installieren

Rust ist die zweite Basis-Software (für den technischen App-Kern).

Kopiere diesen Befehl komplett in dein Terminal und drücke Enter:

```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Es erscheint eine Frage im Terminal – tippe einfach `1` und drücke Enter (Standard-Installation).

Wenn das fertig ist, schließe das Terminal-Fenster komplett und öffne es neu (wichtig, sonst funktioniert der nächste Schritt nicht).

### Schritt 3: In den Projektordner wechseln

Im neuen Terminal-Fenster, kopiere folgenden Befehl (er führt dich in den Klarwert-Ordner):

```
cd /Users/aj/projekte/Klarwert
```

*(Falls du den Ordner an eine andere Stelle verschoben hast, passe den Pfad entsprechend an – am einfachsten: Ordner im Finder öffnen, dann `cd ` im Terminal eintippen, ein Leerzeichen, und den Ordner per Drag & Drop aus dem Finder ins Terminal ziehen.)*

### Schritt 4: Abhängigkeiten installieren

```
npm install
```

Das dauert ein bis zwei Minuten. Es werden viele Zeilen Text durchlaufen – das ist normal.

### Schritt 5: Klarwert bauen

```
npm run tauri build
```

Dieser Schritt dauert **deutlich länger** (oft 5–15 Minuten je nach Mac), da hier die eigentliche App zusammengebaut wird. Lass das Terminal einfach offen und warte, bis wieder eine normale Eingabezeile erscheint.

### Schritt 6: Die fertige App finden

Nach erfolgreichem Bau liegt die fertige App hier:

```
src-tauri/target/release/bundle/macos/Klarwert.app
```

Ziehe diese `Klarwert.app`-Datei per Drag & Drop in deinen „Programme"-Ordner (Applications). Ab jetzt kannst du Klarwert wie jede andere App öffnen (Launchpad, Spotlight-Suche mit `Cmd + Leertaste` und „Klarwert" tippen).

Falls macOS beim ersten Start eine Sicherheitswarnung zeigt, folge den Schritten unter **Variante A** weiter oben (Rechtsklick → Öffnen).

---

## Erste Schritte in der App

Beim allerersten Start führt dich Klarwert durch eine kurze Einrichtung:

1. **Willkommen** – kurzer Infotext, dann „Los geht's".
2. **Wer bist du?** – trage deinen Namen ein (weitere Haushaltsmitglieder kannst du über „+ weitere Person" ergänzen) und wähle deine Währung (Standard: Euro).
3. **Konto anlegen** – lege dein erstes Bankkonto oder einen Vermögenswert (z. B. Bargeld) an.

Danach landest du in der App. Über die linke Seitenleiste erreichst du:

- **Vermögen** – deine Konten, Kontostände und Vermögensentwicklung.
- **Transaktionen** – alle Buchungen, durchsuchbar und filterbar.

Weitere Bereiche (Übersicht, Kategorien, Verträge, Budgets, Steuer, Rechner) sind in der aktuellen Version als „folgt später" gekennzeichnet – die App wird schrittweise erweitert.

### Kontoauszug importieren

Auf der Seite **Vermögen** kannst du bei einem Konto auf „Neuer Import" klicken (oder direkt beim Anlegen eines Kontos „Mit Import" wählen), um eine CSV- oder Excel-Datei deiner Bank hochzuladen. Klarwert erkennt viele gängige deutsche Banken automatisch (Sparkasse, ING, DKB, comdirect, Commerzbank, Volksbank/GLS, N26, Trade Republic). Bei anderen Banken hilft dir ein Assistent, die Spalten der Datei zuzuordnen.

### Wo liegen meine Daten?

Alle Daten speichert Klarwert in einer einzigen Datei auf deinem Mac, nicht im Internet. Ein Backup dieser Datei (Funktion folgt in einer späteren Version) reicht, um alles zu sichern.

---

## Bei Problemen

- **„command not found" im Terminal:** Terminal schließen, neu öffnen, Befehl erneut versuchen.
- **Build bricht mit einer roten Fehlermeldung ab:** Meist hilft es, `npm install` (Schritt 4) erneut auszuführen und danach `npm run tauri build` (Schritt 5) zu wiederholen.
- **App lässt sich nicht öffnen („nicht verifizierter Entwickler"):** Siehe Hinweis unter „Variante A" (Rechtsklick → Öffnen).
