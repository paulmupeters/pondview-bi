SELECT user_id, SUM(total) AS total_sales
FROM "pondview"."main"."stg_cart_items"
GROUP BY 1
ORDER BY total_sales DESC
LIMIT 5;
