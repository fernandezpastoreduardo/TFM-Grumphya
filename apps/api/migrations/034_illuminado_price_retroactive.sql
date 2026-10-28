-- deployment-rollback-compatible: true
-- deployment-data-rewrite: retroactive-illuminado-price
UPDATE plans
SET monthly_price_eur = 3.00
WHERE code = 'ILUMINADO';

UPDATE simulated_purchases purchase
SET amount_eur = 3.00
FROM subscriptions subscription
WHERE purchase.subscription_id = subscription.id
  AND subscription.plan_code = 'ILUMINADO';
