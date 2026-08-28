-- klarwert – seed-daten (seed-data.md abschnitt 1, 2, 4; settings-defaults)

-- abschnitt 1: template-kategorien (13 obergruppen)

insert into categories (name, color, icon, is_template, sort_order) values ('Wohnen', '#1d4750', 'home', 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Wohnnebenkosten', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Heimwerken und Garten', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Strom', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Gas', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Möbel und Haushaltsgeräte', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Haushaltsdienstleistungen', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 6);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Immobilienkredit', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 7);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Miete / Wohngeld', '#1d4750', (select id from categories where name = 'Wohnen' and parent_id is null), 1, 8);

insert into categories (name, color, icon, is_template, sort_order) values ('Kinder', '#b79a5b', 'baby', 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kinderbetreuung und -gruppen', '#b79a5b', (select id from categories where name = 'Kinder' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Taschengeld / Unterhalt', '#b79a5b', (select id from categories where name = 'Kinder' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Spielwaren', '#b79a5b', (select id from categories where name = 'Kinder' and parent_id is null), 1, 3);

insert into categories (name, color, icon, is_template, sort_order) values ('Lebenshaltung', '#6f9a6d', 'shopping-basket', 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Drogerie', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Lebensmittel und Getränke', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Haushaltsbedarf', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Festnetz und Internet', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Handy', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Haustier (-bedarf)', '#6f9a6d', (select id from categories where name = 'Lebenshaltung' and parent_id is null), 1, 6);

insert into categories (name, color, icon, is_template, sort_order) values ('Gesundheit und Wellness', '#4e8d7c', 'heart-pulse', 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Arztbesuch / Krankenhaus', '#4e8d7c', (select id from categories where name = 'Gesundheit und Wellness' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Arznei- und Heilmittel', '#4e8d7c', (select id from categories where name = 'Gesundheit und Wellness' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Wellness und Beauty', '#4e8d7c', (select id from categories where name = 'Gesundheit und Wellness' and parent_id is null), 1, 3);

insert into categories (name, color, icon, is_template, sort_order) values ('Einnahmen', '#3f7d4e', 'banknote', 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Staatliche Leistung und Förderung', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Unterhalt', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kapitaleinkommen', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Bareinzahlung', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Mieteinnahmen', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Rente und Pension', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 6);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Gehalt', '#3f7d4e', (select id from categories where name = 'Einnahmen' and parent_id is null), 1, 7);

insert into categories (name, color, icon, is_template, sort_order) values ('Versicherung', '#6b7a80', 'shield', 1, 6);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Unfallversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Krankenversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Wohngebäudeversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Hausratversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Rechtsschutzversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Haftpflichtversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 6);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Pflegeversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 7);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Berufsunfähigkeitsversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 8);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Tierversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 9);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kranken-Zusatzversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 10);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Risiko-Lebensversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 11);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Reiseversicherung', '#6b7a80', (select id from categories where name = 'Versicherung' and parent_id is null), 1, 12);

insert into categories (name, color, icon, is_template, sort_order) values ('Freizeit, Hobbies und Soziales', '#c07a4a', 'ticket', 1, 7);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kirche / Spende', '#c07a4a', (select id from categories where name = 'Freizeit, Hobbies und Soziales' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Freizeitaktivitäten', '#c07a4a', (select id from categories where name = 'Freizeit, Hobbies und Soziales' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Restaurant / Cafe / Bar', '#c07a4a', (select id from categories where name = 'Freizeit, Hobbies und Soziales' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Sport und Fitness', '#c07a4a', (select id from categories where name = 'Freizeit, Hobbies und Soziales' and parent_id is null), 1, 4);

insert into categories (name, color, icon, is_template, sort_order) values ('Mobilität', '#4a6fa5', 'car', 1, 8);
insert into categories (name, color, parent_id, is_template, sort_order) values ('KFZ-Versicherung', '#4a6fa5', (select id from categories where name = 'Mobilität' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('KFZ-Kredit / Leasingrate / KFZ-Kauf', '#4a6fa5', (select id from categories where name = 'Mobilität' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('KFZ-Sonstige', '#4a6fa5', (select id from categories where name = 'Mobilität' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Tanken', '#4a6fa5', (select id from categories where name = 'Mobilität' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Taxi / ÖPNV / Car- und Bikesharing', '#4a6fa5', (select id from categories where name = 'Mobilität' and parent_id is null), 1, 5);

insert into categories (name, color, icon, is_template, sort_order) values ('Sparen und Anlegen', '#2e6e5e', 'piggy-bank', 1, 9);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Festgeld / Tagesgeld / Sparkonto', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Bausparen', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kapitallebensversicherung', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Private Rentenversicherung', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Wertpapieranlage', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 5);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Wertgegenstände und andere Anlagen', '#2e6e5e', (select id from categories where name = 'Sparen und Anlegen' and parent_id is null), 1, 6);

insert into categories (name, color, icon, is_template, sort_order) values ('Shopping und Unterhaltung', '#8a5fa0', 'shopping-bag', 1, 10);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Bücher / Zeitungen / Zeitschriften', '#8a5fa0', (select id from categories where name = 'Shopping und Unterhaltung' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Bekleidung / Schuhe / Accessoires', '#8a5fa0', (select id from categories where name = 'Shopping und Unterhaltung' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Unterhaltungselektronik und Software', '#8a5fa0', (select id from categories where name = 'Shopping und Unterhaltung' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Büromaterial', '#8a5fa0', (select id from categories where name = 'Shopping und Unterhaltung' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('TV / Video / Musik', '#8a5fa0', (select id from categories where name = 'Shopping und Unterhaltung' and parent_id is null), 1, 5);

insert into categories (name, color, icon, is_template, sort_order) values ('Reisen', '#3e8fa3', 'plane', 1, 11);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Hotel und Unterkunft', '#3e8fa3', (select id from categories where name = 'Reisen' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Pauschalreise', '#3e8fa3', (select id from categories where name = 'Reisen' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Transport', '#3e8fa3', (select id from categories where name = 'Reisen' and parent_id is null), 1, 3);

insert into categories (name, color, icon, is_template, sort_order) values ('Bank und Kredit', '#55606a', 'landmark', 1, 12);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kontentransfer', '#55606a', (select id from categories where name = 'Bank und Kredit' and parent_id is null), 1, 1);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Bankgebühren', '#55606a', (select id from categories where name = 'Bank und Kredit' and parent_id is null), 1, 2);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Barauszahlung', '#55606a', (select id from categories where name = 'Bank und Kredit' and parent_id is null), 1, 3);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kreditkartenabrechnung', '#55606a', (select id from categories where name = 'Bank und Kredit' and parent_id is null), 1, 4);
insert into categories (name, color, parent_id, is_template, sort_order) values ('Kredittilgung und -zinsen', '#55606a', (select id from categories where name = 'Bank und Kredit' and parent_id is null), 1, 5);

-- "unkategorisiert" – system-kategorie, weder ausblendbar noch löschbar, pipeline-fallback
insert into categories (name, color, icon, is_template, is_system, sort_order) values ('Unkategorisiert', '#9aa4a8', 'circle-help', 0, 1, 13);

-- abschnitt 2: sparzwecke (defaults)

insert into sparzwecke (name, color, sort_order) values ('Rente / FIRE', '#2e6e5e', 1);
insert into sparzwecke (name, color, sort_order) values ('Hauskauf', '#1d4750', 2);
insert into sparzwecke (name, color, sort_order) values ('Kind', '#b79a5b', 3);
insert into sparzwecke (name, color, sort_order) values ('Urlaub', '#3e8fa3', 4);
insert into sparzwecke (name, color, sort_order) values ('Notgroschen', '#6b7a80', 5);

-- abschnitt 4: dashboard-widgets (feste reihenfolge, alle sichtbar)

insert into widgets (id, is_visible, sort_order, config_json) values ('kpi_income', 1, 1, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('kpi_expenses', 1, 2, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('kpi_saving_amount', 1, 3, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('kpi_saving_rate', 1, 4, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('sankey', 1, 5, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('categorization_progress', 1, 6, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('collection_focus', 1, 7, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('category_donut', 1, 8, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('cashflow_trend', 1, 9, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('saving_by_purpose', 1, 10, null);
insert into widgets (id, is_visible, sort_order, config_json) values ('person_compare', 1, 11, '{"metric":"expenses"}');
insert into widgets (id, is_visible, sort_order, config_json) values ('upcoming_payments', 1, 12, null);

-- settings mit defaults

insert into settings (key, value) values ('currency', 'EUR');
insert into settings (key, value) values ('import_reminder_days', '30');
insert into settings (key, value) values ('kirchensteuer_aktiv', '0');
insert into settings (key, value) values ('kirchensteuer_satz', '8');
insert into settings (key, value) values ('onboarding_done', '0');

insert into meta (key, value) values ('schema_version', '1');
