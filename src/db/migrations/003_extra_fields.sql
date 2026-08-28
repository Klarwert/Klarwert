-- klarwert – phase 2: zusätzliche bankfelder aus dem import (auge-icon in der transaktionstabelle)

alter table transactions add column extra_fields_json text;
-- json-keys: transaction_type, card_payment_at, cash_withdrawal_at, recipient_iban,
-- recipient_bic, recipient_account_number, description, bank_category, bank_subcategory, bank_account_label
