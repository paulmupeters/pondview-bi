CREATE OR REPLACE TABLE mart_revenue_by_category AS
SELECT
  p.category,
  SUM(i.discountedTotal) AS revenue,
  SUM(i.quantity) AS units_sold,
  COUNT(DISTINCT i.cart_id) AS carts
FROM stg_cart_items i
JOIN stg_products p USING (product_id)
GROUP BY p.category
ORDER BY revenue DESC;

CREATE OR REPLACE TABLE mart_revenue_by_country AS
SELECT
  u.country,
  SUM(i.discountedTotal) AS revenue,
  COUNT(DISTINCT i.user_id) AS customers
FROM stg_cart_items i
JOIN stg_users u USING (user_id)
GROUP BY u.country
ORDER BY revenue DESC;

CREATE OR REPLACE TABLE mart_top_products AS
SELECT
  product_name,
  SUM(quantity) AS units_sold,
  SUM(discountedTotal) AS revenue
FROM stg_cart_items
GROUP BY product_name
ORDER BY revenue DESC;