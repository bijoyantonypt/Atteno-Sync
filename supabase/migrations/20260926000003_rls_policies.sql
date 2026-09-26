-- Row Level Security for attendance tables
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices           ENABLE ROW LEVEL SECURITY;

-- ── attendance_events ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employees see own events"   ON public.attendance_events;
DROP POLICY IF EXISTS "admins see all events"      ON public.attendance_events;
DROP POLICY IF EXISTS "service inserts events"     ON public.attendance_events;

CREATE POLICY "employees see own events"
  ON public.attendance_events FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "admins see all events"
  ON public.attendance_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid() AND e.is_admin AND e.is_active
    )
  );

-- Only the service_role (used by the sync job) can insert
CREATE POLICY "service inserts events"
  ON public.attendance_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── employees ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employees see self"   ON public.employees;
DROP POLICY IF EXISTS "admins see everyone"  ON public.employees;

CREATE POLICY "employees see self"
  ON public.employees FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "admins see everyone"
  ON public.employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid() AND e.is_admin AND e.is_active
    )
  );

-- ── devices ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins see devices" ON public.devices;

CREATE POLICY "admins see devices"
  ON public.devices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = auth.uid() AND e.is_admin AND e.is_active
    )
  );
