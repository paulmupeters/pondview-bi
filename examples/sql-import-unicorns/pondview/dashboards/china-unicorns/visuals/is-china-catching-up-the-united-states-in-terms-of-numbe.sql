SELECT country, company_count, total_valuation_billions, avg_valuation_billions
FROM "unicorns_dwh"."main"."mart_unicorns_by_country"
WHERE country IN ('United States', 'China')
ORDER BY CASE country WHEN 'United States' THEN 1 WHEN 'China' THEN 2 END;
