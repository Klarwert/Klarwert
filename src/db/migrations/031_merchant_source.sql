-- migration 031 – explizite Herkunfts-Spur für Händler-Einträge (system/community/user).
--
-- Bisher unterschied `merchants` nur über `is_builtin` (0/1) und `is_modified` (0/1) zwischen "vom
-- Nutzer angelegt/verändert" und "kuratiert" - beides zusammen kollabierte aber "mit der App
-- ausgeliefert" (seedDefaultMerchants) und "aus der Community-Datei übernommen"
-- (applyMerchantDataRelease) in denselben is_builtin=1-Zustand. Es gab keine Möglichkeit
-- nachzuvollziehen, woher ein konkreter Eintrag stammt.
--
-- `source` ist bewusst eine rein zusätzliche, informative Spalte: sie ändert NICHTS an der
-- bestehenden, bereits korrekten Konfliktlogik (is_modified blockiert jedes Overwrite,
-- unabhängig von `source`). Priorität bleibt weiterhin implizit über is_modified geregelt:
-- user (is_modified=1) > community/system (is_modified=0). `source` macht das nur explizit
-- abfragbar/auditierbar, statt eine neue Durchsetzungs-Ebene einzuführen (Risiko, bestehendes,
-- bereits verifiziertes Verhalten zu brechen).
alter table merchants add column source text not null default 'system' check (source in ('system', 'community', 'user'));

-- Backfill für bestehende Installationen: is_builtin=0 war bisher immer "vom Nutzer angelegt".
-- is_builtin=1-Zeilen bleiben beim Default 'system' - eine rückwirkende Unterscheidung
-- system/community ist für bereits bestehende Installationen nicht mehr rekonstruierbar (das ist
-- eine bekannte, akzeptierte Grenze: ab dieser Migration ist die Herkunft für NEUE Einträge exakt,
-- für Alt-Bestand bestenfalls "kuratiert" vs. "eigen").
update merchants set source = 'user' where is_builtin = 0;
