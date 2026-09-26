-- Allow 'essl' as an attendance_events source (previously only 'kiosk' and 'admin')
ALTER TABLE public.attendance_events
  DROP CONSTRAINT attendance_events_source_check;

ALTER TABLE public.attendance_events
  ADD CONSTRAINT attendance_events_source_check
  CHECK (source IN ('kiosk', 'admin', 'essl'));

-- Register the eSSL X990 device (run this once manually, update values)
-- INSERT INTO public.devices (name, public_key_spki, status)
-- VALUES ('eSSL X990 Factory Floor', 'NOT_APPLICABLE_NO_CRYPTO_KEY', 'active')
-- RETURNING id;  -- copy this UUID into your .env as ESSL_DEVICE_ID
