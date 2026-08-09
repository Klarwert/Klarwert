# Klarwert – Händler & Regel-Vorlagen zusammenführen: Umsetzung

Setzt `klarwert-haendler-regel-konzept-v2.md` um. Größter Einzelauftrag dieser Runde – Zeit nehmen, nicht mit den kleineren Bugfixes vermischen.

## Aufgabe

- [ ] 1. **Migration:** `alter table rules add column merchant_id integer references merchants(id) on delete cascade`. Bestehende ~50 Regel-Vorlagen in Händler + verknüpfte Regel umwandeln (siehe Konzept Abschnitt 6), Original-Pipelinestufe "Regel-Vorlagen" danach entfernen – Händler-Erkennung übernimmt die Funktion.
- [ ] 2. **Pipeline anpassen:** Händler-Erkennungs-Stufe prüft nach Alias-Treffer die verknüpften `rules` des Händlers in Prioritätsreihenfolge (erste treffende gewinnt), Fallback: einzige/erste Regel ohne weitere Bedingung. Bestehende Determinismus-Tests aus `prompt-unit-tests.md` entsprechend erweitern (nicht ersetzen).
- [ ] 3. **UI: Aktiv/Herkunft vereinheitlichen** für Kategorien, Bank-Vorlagen und Händler – ein Toggle (aktiv/inaktiv) statt "unterdrücken", ein Herkunfts-Tag ("Kuratiert"/"Angepasst"/"Eigene") ohne Einfluss auf das Matching-Verhalten.
- [ ] 4. **Kuratierte Einträge editierbar machen:** Bearbeiten erzeugt lokale Überschreibung, Tag wechselt zu "Angepasst", Original bleibt für künftige Diffs erhalten (Erweiterung des bestehenden "Regel-Update prüfen"-Mechanismus um den Fall "lokale Anpassung vorhanden").
- [ ] 5. **Alias-Vorschläge bei Händler-Erstellung:** ähnliche Empfänger-Rohtexte aus eigenen Transaktionen vorschlagen (dieselbe Normalisierungsfunktion wie beim Matching), anklickbar statt nur Freitext.
- [ ] 6. **Sharing-Mechanismus:** "Vorschläge teilen" bekommt zwei Optionen (GitHub-Issue öffnen / Datei herunterladen) statt nur GitHub – identisch für Bank-Vorlagen und Händler, ein gemeinsames UI-Bauteil, keine zwei Implementierungen.
- [ ] 7. **`klarwert-community-rules.md` und `prompt-community-datenbanken.md` gedanklich aktualisieren** (Hinweis für den nächsten Antigravity-Durchlauf, keine Code-Änderung in diesem Auftrag nötig): "Regel-Vorlage teilen" und "Händler teilen" sind ab jetzt derselbe Vorgang.

## Definition of Done

- [ ] Ein Test: Amazon-Händler mit zwei Regeln (Bedingung A → Kategorie X, sonst → Kategorie Y) liefert für zwei unterschiedliche Testbuchungen tatsächlich zwei unterschiedliche Kategorien.
- [ ] Ein kuratierter Händler lässt sich bearbeiten, ohne dass die App abstürzt oder der Eintrag verschwindet, Tag zeigt danach "Angepasst".
- [ ] "Datei herunterladen" erzeugt eine valide JSON-Datei ohne GitHub-Aufruf.
