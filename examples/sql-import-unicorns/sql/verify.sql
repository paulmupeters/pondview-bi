SELECT
  'unicorns' AS table_name,
  count(*) AS row_count
FROM unicorns
UNION ALL
SELECT
  'unicorns_enriched' AS table_name,
  count(*) AS row_count
FROM unicorns_enriched
UNION ALL
SELECT
  'mart_unicorns_by_country' AS table_name,
  count(*) AS row_count
FROM mart_unicorns_by_country
UNION ALL
SELECT
  'mart_unicorns_by_industry' AS table_name,
  count(*) AS row_count
FROM mart_unicorns_by_industry
UNION ALL
SELECT
  'mart_unicorns_joined_by_year' AS table_name,
  count(*) AS row_count
FROM mart_unicorns_joined_by_year
ORDER BY table_name;

SELECT
  company,
  valuation_billions,
  country,
  industry
FROM unicorns_enriched
ORDER BY valuation_billions DESC NULLS LAST
LIMIT 10;
