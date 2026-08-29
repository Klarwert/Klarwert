-- migration 032 – stabiler template_key für Standard-Steuer-Themen.
--
-- steuer_themen.name war bisher die einzige Kennung der 6 mitgelieferten Standard-Themen
-- (DEFAULT_THEMEN in steuer.ts) - fest verdrahtet auf Deutsch, ohne Möglichkeit, sie wie die
-- Standard-Kategorien (categories.template_key) sprachunabhängig zu übersetzen. Analog zu
-- categories.template_key: nie umbenennen/entfernen, sonst verlieren bestehende Installationen
-- die Zuordnung.
alter table steuer_themen add column template_key text;

-- Backfill für Installationen, die die 6 Standard-Themen schon vor template_key angelegt haben -
-- Zuordnung einmalig über den bisher einzigen Schlüssel (den deutschen Namen). Nutzerdefinierte
-- Themen (jeder andere Name) behalten template_key = NULL und damit ihren eigenen, unübersetzten Namen.
update steuer_themen set template_key = 'versicherung_vorsorge' where name = 'Versicherungen & Vorsorge' and template_key is null;
update steuer_themen set template_key = 'handwerker_dienstleistungen' where name = 'Handwerker & haushaltsnahe Dienstleistungen' and template_key is null;
update steuer_themen set template_key = 'spenden_kirche' where name = 'Spenden & Kirche' and template_key is null;
update steuer_themen set template_key = 'gesundheitskosten' where name = 'Gesundheitskosten' and template_key is null;
update steuer_themen set template_key = 'kinderbetreuung' where name = 'Kinderbetreuung' and template_key is null;
update steuer_themen set template_key = 'kapitalertraege' where name = 'Kapitalerträge' and template_key is null;
