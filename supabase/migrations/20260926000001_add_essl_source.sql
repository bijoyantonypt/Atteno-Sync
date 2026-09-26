-- Allow 'essl' as a valid attendance_events source
ALTER TABLE public.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_source_check;

ALTER TABLE public.attendance_events
  ADD CONSTRAINT attendance_events_source_check
  CHECK (source IN ('kiosk', 'admin', 'essl'));

-- Register the eSSL X990 device (adjust the crypto key placeholder)
INSERT INTO public.devices (name, public_key_spki, status)
VALUES ('eSSL X990 Factory Floor', 'NOT_APPLICABLE_NO_CRYPTO_KEY', 'active')
ON CONFLICT (public_key_spki) DO NOTHING;

-- Copy the returned id into .env as ESSL_DEVICE_ID
SELECT id, name FROM public.devices WHERE name = 'eSSL X990 Factory Floor';
