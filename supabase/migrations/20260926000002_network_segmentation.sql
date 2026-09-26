-- Create a dedicated schema for attendance operations
CREATE SCHEMA IF NOT EXISTS attendance;

-- Move all attendance-related tables to the new schema
ALTER TABLE public.attendance_events SET SCHEMA attendance;
ALTER TABLE public.employees SET SCHEMA attendance;
ALTER TABLE public.devices SET SCHEMA attendance;

-- Set up row-level security
ALTER TABLE attendance.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.devices ENABLE ROW LEVEL SECURITY;

-- Create a dedicated role for attendance operations
CREATE ROLE attendance_admin WITH LOGIN PASSWORD 'secure_password_here';
GRANT USAGE ON SCHEMA attendance TO attendance_admin;
GRANT SELECT, INSERT, UPDATE ON attendance.attendance_events TO attendance_admin;
GRANT SELECT ON attendance.employees TO attendance_admin;
GRANT SELECT ON attendance.devices TO attendance_admin;
