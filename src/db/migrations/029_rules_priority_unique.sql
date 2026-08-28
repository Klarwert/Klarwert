-- Bugfix-Runde 5: rules.priority verlor beim Table-Rebuild in Migration 009 (fix_all_foreign_keys)
-- stillschweigend seinen "unique"-Constraint aus 001_schema.sql (dort: "global; kleinste zahl wird
-- zuerst geprüft, erste treffende regel gewinnt"). Seitdem sind doppelte Prioritäten unter aktiven
-- Regeln auf DB-Ebene möglich, was die dokumentierte globale Eindeutigkeit unterläuft.
--
-- Bewusst KEIN Table-Rebuild (rename+recreate), um das mehrfach dokumentierte
-- ALTER-TABLE-RENAME-Fremdschlüssel-Problem dieser Codebase (siehe 008/009/012/016/020,
-- jeweils "PRAGMA legacy_alter_table" vergessen) nicht erneut zu riskieren – rule_condition_groups
-- und categorization_log zeigen weiterhin per Fremdschlüssel auf rules(id). Ein partieller
-- Unique-Index (nur für aktive Regeln) erreicht dieselbe Garantie ohne Rebuild.

-- Bestehende Duplikate unter aktiven Regeln vor dem Anlegen des Index deterministisch auflösen:
-- dichte, lückenlose Neu-Nummerierung in bisheriger Reihenfolge (Priorität, dann id als Tie-Breaker).
-- Für bereits eindeutige Installationen ist das ein reines Kompaktieren eventueller Lücken, keine
-- Änderung der relativen Reihenfolge (auf die allein sich Anwendungscode verlässt, siehe rules.ts).
create temporary table rules_priority_renumber as
select id, row_number() over (order by priority asc, id asc) as new_priority
from rules
where is_deleted = 0;

update rules
set priority = (select new_priority from rules_priority_renumber where rules_priority_renumber.id = rules.id)
where id in (select id from rules_priority_renumber);

drop table rules_priority_renumber;

create unique index if not exists idx_rules_priority_active_unique on rules(priority) where is_deleted = 0;
