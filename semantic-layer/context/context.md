---
name: [Datasource Name]
description: [One sentence on what data is here]
---

## 1. Database Mapping (The "Where")
- **Primary Table:** `database.schema.table`
- **Join Keys:** `table_a.id = table_b.a_id`
- **Date Column:** Always use `created_at_utc` for time-series.

## 2. Business Rules (The "Mandatory Filters")
- **Global Filter:** Always append `WHERE is_deleted = false`.
- **Bot Exclusion:** Use `user_agent NOT LIKE '%bot%'`.
- **Currency:** All `amount` columns are in cents; divide by 100.0 for Euro value.

## 3. Translation Patterns (The "How")
- **"New Customers"** → `first_order_date >= CURRENT_DATE - INTERVAL 7 DAY`
- **"High Value"** → `total_spend_cents > 100000`
- **"Churned"** → `last_login < CURRENT_DATE - INTERVAL 30 DAY`

## 4. Specific Quirks (The "Warnings")
- The `location` column uses ISO-2 country codes (e.g., 'NL' for Netherlands).
- Data before 2023-01-01 is unreliable; add a warning if the user asks for historical data.