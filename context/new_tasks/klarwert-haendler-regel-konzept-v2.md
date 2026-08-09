# Klarwert – Händler & Regel-Vorlagen: konsolidiertes Konzept v2

Ersetzt die getrennte Pipelinestufe "Regel-Vorlagen" – wird Teil der Händler-Erkennung. Betrifft `prompt-community-datenbanken.md`/`klarwert-community-rules.md` insofern, als "Regel-Vorlage teilen" jetzt exakt derselbe Vorgang wie "Händler teilen" ist, nicht mehr zwei.

## 1. Warum zusammenführen

"Regel-Vorlagen" (Name + Suchbegriff, eigene Pipelinestufe) und "Händler" (Merchants, Aliase, Ebene A) lösen dieselbe Aufgabe. Die Verwirrung bei Name vs. Suchbegriff (im Bugreport: "bis auf Groß-/Kleinschreibung der gleiche Eintrag") ist ein Symptom von zwei parallelen Systemen für eine Sache, nicht ein UI-Detail, das man isoliert reparieren sollte.

## 2. Datenmodell

- `merchants` bleibt (Name, Aliase, `is_builtin`, `source_version`, `country`) – **verliert** `default_category_id` als einziges Aktions-Feld.
- Neue Spalte `rules.merchant_id integer references merchants(id) on delete cascade` – analog zu `rules.source_contract_id`.
- Ein Händler hat **eine oder mehrere** `rules`-Zeilen mit ihren `rule_conditions`. Einfacher Fall: eine Regel, eine Bedingung ("Alias trifft") → Kategorie. Komplexer Fall: mehrere Regeln, erste treffende gewinnt (nutzt die bestehende globale `rules.priority`), z. B. "Amazon + Verwendungszweck enthält 'Prime' → Streaming", "Amazon (sonst) → Shopping".
- Händler-Erkennung (Pipeline-Stufe, ehemals "Ebene A") prüft: trifft ein Alias des Händlers? → dann die Regeln dieses Händlers in Prioritätsreihenfolge auswerten, erste treffende gewinnt, sonst (falls keine Bedingung über den Alias-Treffer hinaus nötig ist) die einzige/erste Regel als Default.
- Die separate "Regel-Vorlagen"-Pipelinestufe entfällt ersatzlos – ihre ~50 mitgelieferten Einträge werden zu Händlern mit je einer Regel migriert (einmaliges Migrationsskript, keine Dateninhalte gehen verloren).

## 3. Aktiv/Herkunft statt Kuratiert/Unterdrücken

Einheitlich für **Kategorien, Bank-Vorlagen und Händler** (bisher pro Bereich unterschiedlich benannt):

- **Ein Toggle: aktiv/inaktiv.** Ersetzt "unterdrücken" – ein inaktiver Eintrag wird beim Matching übersprungen, unabhängig von seiner Herkunft. Konsistent mit dem bereits bestehenden Muster bei Bank-Vorlagen.
- **Ein Herkunfts-Tag, rein informativ, ändert nichts am Verhalten:** "Kuratiert" (unverändert aus der Community-Quelle), "Angepasst" (ursprünglich kuratiert, lokal bearbeitet), "Eigene" (komplett lokal angelegt).
- **Kuratierte Einträge werden editierbar** (bisher gesperrt): Bearbeiten erzeugt eine lokale Überschreibung, der Eintrag wird zu "Angepasst", die Original-Kuratierung bleibt im Hintergrund erhalten. Künftige Community-Updates zu genau diesem Eintrag erscheinen im bestehenden "Regel-Update prüfen"-Diff als eigene Zeile ("Kuratierte Version hat sich geändert, du hast eine eigene Anpassung – übernehmen, ignorieren, oder beides vergleichen?").

## 4. Sharing-Mechanismus – identisch für Bank-Vorlagen und Händler

Aktuell: "Vorschläge teilen" öffnet direkt ein vorausgefülltes GitHub-Issue. Problem: setzt einen GitHub-Account voraus.

Neu, zwei gleichwertige Optionen, für beide Bereiche identisch:

1. **"GitHub-Issue öffnen"** (primär, ein Klick) – wie bisher.
2. **"Datei herunterladen"** – dieselbe JSON-Struktur als Datei speichern, keine weiteren Vorgaben, wie sie danach zu dir gelangt (E-Mail, Discord, Forum – die App muss das nicht wissen). Gleichzeitig die einfachste Umsetzung von "eigene Vorlagen exportieren", die separat gewünscht war – ist keine zweite Funktion, sondern derselbe Button ohne den GitHub-Schritt danach.

Für "Angepasst"-Einträge (bearbeitete kuratierte Händler/Vorlagen) funktioniert derselbe Mechanismus – das Issue/die Datei enthält dann sinnvollerweise einen Hinweis "Ergänzung zu bestehendem Eintrag X" statt "neuer Eintrag".

## 5. Aliase bei der Erstellung vorbefüllen

Nach Anlegen eines Händlers: Vorschlagsliste ähnlicher/passender Empfänger-Rohtexte aus den eigenen Transaktionen (gleiche Normalisierungsfunktion wie beim Matching selbst), zum Anklicken statt Abtippen als Alias übernehmen.

## 6. Migration der bestehenden ~50 Regel-Vorlagen

Einmaliges Skript: jede bestehende Regel-Vorlage wird zu einem Händler (Name als `canonical_name`, Suchbegriff als erster Alias `match_type='name_fuzzy'`) mit einer verknüpften `rules`-Zeile (`merchant_id` gesetzt, `created_from` sinngemäß erweitern oder bestehenden Wert wiederverwenden). Keine Datenverluste, keine doppelte Abfrage beim Nutzer.
