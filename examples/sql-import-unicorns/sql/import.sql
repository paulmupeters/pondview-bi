INSTALL httpfs;
LOAD httpfs;

CREATE OR REPLACE TABLE unicorns AS
SELECT *
FROM read_csv_auto('https://data.pondview.app/unicorns.csv');

CREATE OR REPLACE TABLE unicorns_enriched AS
SELECT
  "Company" AS company,
  try_cast(
    replace(
      regexp_replace("Valuation ($B)", '[^0-9,.-]', '', 'g'),
      ',',
      '.'
    ) AS DECIMAL(12, 2)
  ) AS valuation_billions,
  "Date Joined" AS date_joined,
  year("Date Joined") AS year_joined,
  "Country" AS country,
  "City" AS city,
  "Industry" AS industry,
  "Investors" AS investors
FROM unicorns;

CREATE OR REPLACE TABLE mart_unicorns_by_country AS
SELECT
  country,
  count(*) AS company_count,
  sum(valuation_billions) AS total_valuation_billions,
  avg(valuation_billions) AS avg_valuation_billions
FROM unicorns_enriched
GROUP BY country
ORDER BY total_valuation_billions DESC;

CREATE OR REPLACE TABLE mart_unicorns_by_industry AS
SELECT
  industry,
  count(*) AS company_count,
  sum(valuation_billions) AS total_valuation_billions,
  avg(valuation_billions) AS avg_valuation_billions
FROM unicorns_enriched
GROUP BY industry
ORDER BY total_valuation_billions DESC;

CREATE OR REPLACE TABLE mart_unicorns_joined_by_year AS
SELECT
  year_joined,
  country,
  count(*) AS company_count,
  sum(valuation_billions) AS total_valuation_billions
FROM unicorns_enriched
GROUP BY year_joined, country
ORDER BY year_joined, total_valuation_billions DESC;
