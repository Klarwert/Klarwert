-- Bugfix-Runde 5: budget_periods hatte keinen Unique-Constraint auf (budget_id, period_start).
-- src/db/repositories/budgets.ts (spentAndLimitForPeriod) liest zuerst, ob für eine Periode bereits
-- ein Snapshot existiert, und legt bei Bedarf einen neuen an ("check-then-insert"). Ohne diesen Index
-- konnten zwei sich überlappende Aufrufe (z. B. zwei React-Query-Refetches derselben Budgetübersicht)
-- theoretisch je einen eigenen Snapshot für dieselbe Periode anlegen. Der Index macht das auf
-- DB-Ebene unmöglich; das Repository nutzt dafür seit diesem Fix "insert ... on conflict do nothing".
create unique index if not exists idx_budget_periods_unique on budget_periods(budget_id, period_start);
