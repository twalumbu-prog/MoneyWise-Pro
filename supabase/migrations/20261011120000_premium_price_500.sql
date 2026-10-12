-- Premium plan is K500/month (was seeded at K250). With the Master Fees add-on (K500) an
-- integrated org's invoice is K1,000 per cycle.
UPDATE public.subscription_plans SET price_zmw = 500 WHERE id = 'premium';
