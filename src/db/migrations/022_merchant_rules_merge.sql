-- migration 022 – Händler & Regel-Vorlagen zusammenführen (siehe klarwert-haendler-regel-konzept-v2.md).
-- "Regel-Vorlagen" (Name + Suchbegriff, eigene Pipelinestufe) und "Händler" (Ebene A) lösten dieselbe
-- Aufgabe über zwei parallele Systeme. Ab jetzt: ein Händler hat eine oder mehrere rules-Zeilen,
-- die Händler-Erkennung übernimmt die Funktion der separaten Regel-Vorlagen-Stufe vollständig.

alter table rules add column merchant_id integer references merchants(id) on delete cascade;

-- "Angepasst" statt gesperrt: kuratierte Händler werden editierbar, eine Bearbeitung setzt dieses
-- Flag (analog import_profiles.locally_modified), ohne is_builtin zu verändern – Herkunfts-Tag
-- ("Kuratiert"/"Angepasst"/"Eigene") ist rein informativ, siehe Konzept Abschnitt 3.
alter table merchants add column is_modified integer not null default 0;
