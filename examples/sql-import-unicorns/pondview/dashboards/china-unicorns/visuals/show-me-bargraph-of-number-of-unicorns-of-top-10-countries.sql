SELECT country, company_count AS unicorn_count
FROM "unicorns_dwh"."main"."mart_unicorns_by_country"
WHERE country IS NOT NULL
ORDER BY company_count DESC
LIMIT 10;
