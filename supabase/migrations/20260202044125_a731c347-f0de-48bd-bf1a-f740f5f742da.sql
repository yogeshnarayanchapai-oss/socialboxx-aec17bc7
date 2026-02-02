-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_app_settings_key 
  ON app_settings(setting_key);

-- Seed default Facebook settings (if not exists)
INSERT INTO app_settings (setting_key, setting_value)
VALUES 
  ('facebook_app_id', '""'),
  ('facebook_app_secret', '""'),
  ('facebook_webhook_verify_token', '"socialbox_verify_token"')
ON CONFLICT (setting_key) DO NOTHING;