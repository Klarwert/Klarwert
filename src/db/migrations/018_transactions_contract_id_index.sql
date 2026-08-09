-- behebt bugfix-punkt 2: autoArchiveStaleContracts() (contracts.ts) fragt bei jedem
-- listContracts()-Aufruf pro aktivem vertrag "select ... from transactions where contract_id = ?"
-- ab -- ohne index ein full table scan je vertrag, macht sich bei mehreren aktiven
-- verträgen und vielen buchungen als spürbares hängen beim speichern bemerkbar.
create index if not exists idx_tx_contract on transactions(contract_id);
