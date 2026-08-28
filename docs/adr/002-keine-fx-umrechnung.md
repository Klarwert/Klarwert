# ADR-002: Keine FX-Umrechnung

**Status:** Akzeptiert  
**Datum:** 2026-08-20

## Kontext

Wechselkurse ändern sich täglich. Eine korrekte historische Umrechnung müsste den Kurs zum Buchungsdatum kennen, nicht den aktuellen. FX-Kurs-APIs erfordern Netzwerkverbindung und ggf. API-Schlüssel – beides widerspricht dem Kernversprechen von Klarwert.

## Entscheidung

Klarwert rechnet **keine Fremdwährungsbeträge automatisch um**. Es gibt keinen Aufruf einer FX-API, keinen eingebetteten Kursverlauf.

Wenn Transaktionen in unterschiedlichen Währungen vorliegen, werden Summen **pro Währung getrennt** ausgewiesen. Der Nutzer sieht z. B. „EUR 1.240 · USD 350" statt einer umgerechneten Gesamtsumme.

## Konsequenzen

- Die App bleibt vollständig offline – kein Netzwerk-Lookup beim Starten oder Importieren.
- Nutzer mit mehreren Währungen sehen klare, unverfälschte Teilsummen.
- Wer eine eigene Umrechnung möchte, muss das manuell außerhalb der App tun.
- Wertpapier-Kurse (zukünftiges Feature) folgen demselben Prinzip: manueller Eintrag oder CSV-Import, kein Live-Abruf.
