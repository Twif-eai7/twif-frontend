-- Add Miscellaneous & Other expense line to monthly P&L
ALTER TABLE monthly_pl_expenses
  ADD COLUMN IF NOT EXISTS miscellaneous_other numeric;
