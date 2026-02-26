-- Default quota limits for monetizable M3/M4 features.
-- Keeps feature enablement unchanged and only sets explicit limit_value.

UPDATE public.feature_entitlements
SET limit_value = 20,
    updated_at = now()
WHERE plan_tier = 'pro'
  AND feature_key = 'ff_export_pdf';

UPDATE public.feature_entitlements
SET limit_value = 60,
    updated_at = now()
WHERE plan_tier = 'pro'
  AND feature_key = 'ff_export_json_full';

UPDATE public.feature_entitlements
SET limit_value = 120,
    updated_at = now()
WHERE plan_tier = 'team'
  AND feature_key = 'ff_export_pdf';

UPDATE public.feature_entitlements
SET limit_value = 360,
    updated_at = now()
WHERE plan_tier = 'team'
  AND feature_key = 'ff_export_json_full';

UPDATE public.feature_entitlements
SET limit_value = 30,
    updated_at = now()
WHERE plan_tier = 'team'
  AND feature_key = 'ff_public_api_access';

UPDATE public.feature_entitlements
SET limit_value = 120,
    updated_at = now()
WHERE plan_tier = 'team'
  AND feature_key = 'ff_webhooks_enabled';
