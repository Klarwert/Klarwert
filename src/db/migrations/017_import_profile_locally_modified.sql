-- migration 017 – Bankprofile editierbar machen, ohne dass der App-Update Nutzeränderungen überschreibt
--
-- import_profiles.locally_modified: sobald ein Nutzer die Spaltenzuordnung eines Profils (auch eines
-- mitgelieferten) über den Import-Wizard speichert, wird dieses Flag gesetzt. ensureBuiltinBankProfiles()
-- synchronisiert Spaltenzuordnung/Format eines Profils nur, solange dieses Flag 0 ist – dieselbe
-- "fehlt → einfügen, existiert → unangetastet lassen"-Idempotenz wie beim Template-Kategorien-Seeding.
-- Bereits vorhandene Profile starten bei 0, damit Korrekturen am mitgelieferten Standard-Mapping
-- (z. B. DKB Status/Umsatztyp-Vertauschung) einmalig noch ankommen.
alter table import_profiles add column locally_modified integer not null default 0;
