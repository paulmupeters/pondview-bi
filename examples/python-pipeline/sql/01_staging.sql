CREATE OR REPLACE TABLE stg_products AS
SELECT
  id AS product_id,
  title AS product_name,
  category,
  brand,
  price,
  rating,
  stock
FROM raw_products;

CREATE OR REPLACE TABLE stg_users AS
SELECT
  id AS user_id,
  firstName || ' ' || lastName AS customer_name,
  age,
  gender,
  address.country AS country,
  address.city AS city
FROM raw_users;

CREATE OR REPLACE TABLE stg_cart_items AS
SELECT
  c.id AS cart_id,
  c.userId AS user_id,
  p.id AS product_id,
  p.title AS product_name,
  p.quantity,
  p.price,
  p.total,
  p.discountPercentage,
  p.discountedTotal
FROM raw_carts c,
UNNEST(c.products) AS t(p);