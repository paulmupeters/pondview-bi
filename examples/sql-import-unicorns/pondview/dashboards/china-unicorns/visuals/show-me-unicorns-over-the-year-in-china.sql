SELECT year_joined, company_count, total_valuation_billions
FROM "unicorns_dwh"."main"."mart_unicorns_joined_by_year"
WHERE country = 'China'
ORDER BY year_joined;
