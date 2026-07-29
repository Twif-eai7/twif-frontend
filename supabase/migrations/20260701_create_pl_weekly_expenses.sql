-- Weekly Planned vs Actual expense entry for the Financial > P&L Data > Summary tab.
-- Weeks are day-of-month buckets (1-7, 8-14, 15-21, 22-28, 29-end), not ISO weeks.
CREATE TABLE IF NOT EXISTS pl_weekly_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,
  week_number smallint NOT NULL CHECK (week_number BETWEEN 1 AND 5),
  fy_year text NOT NULL,
  pl_mode text NOT NULL DEFAULT 'jng' CHECK (pl_mode IN ('jng', 'jnm', 'overall')),
  salary_employees_planned numeric,
  salary_employees_actual numeric,
  travel_domestic_planned numeric,
  travel_domestic_actual numeric,
  travel_international_planned numeric,
  travel_international_actual numeric,
  rent_planned numeric,
  rent_actual numeric,
  electricity_others_planned numeric,
  electricity_others_actual numeric,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (month_key, week_number, pl_mode)
);