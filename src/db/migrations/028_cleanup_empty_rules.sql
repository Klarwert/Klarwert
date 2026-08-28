-- Bugfix-Runde 4: Regeln ohne tatsächliche Bedingung aus bestehenden Installationen entfernen.
-- Ursache waren ältere Migrationen/Editoren, die nach Einführung von rule_condition_groups
-- Regeln ohne mitmigrierte oder gespeicherte Bedingungen zurücklassen konnten.

delete from rule_condition_groups
where id not in (
  select distinct group_id from rule_conditions where group_id is not null
);

update rules
set is_deleted = 1
where is_deleted = 0
  and id not in (
    select distinct g.rule_id
    from rule_condition_groups g
    join rule_conditions c on c.group_id = g.id
  );
