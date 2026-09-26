-- Enable RLS on attendance tables
ALTER TABLE attendance.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.devices ENABLE ROW LEVEL SECURITY;

-- Policies for attendance_events
CREATE POLICY "Attendance events are viewable by admins and self"
ON attendance.attendance_events FOR SELECT
USING (
  auth.role() = 'attendance_admin' OR
  employee_id = auth.uid()
);

CREATE POLICY "Employees can only view their own attendance"
ON attendance.attendance_events FOR SELECT
USING (employee_id = auth.uid());

CREATE POLICY "Only admins can insert attendance events"
ON attendance.attendance_events FOR INSERT
WITH CHECK (auth.role() = 'attendance_admin');

-- Policies for employees
CREATE POLICY "Employees can view their own profile"
ON attendance.employees FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Admins can view all employees"
ON attendance.employees FOR SELECT
USING (auth.role() = 'attendance_admin');

CREATE POLICY "Employees can update their own profile"
ON attendance.employees FOR UPDATE
USING (id = auth.uid());

-- Policies for devices
CREATE POLICY "Admins can view all devices"
ON attendance.devices FOR SELECT
USING (auth.role() = 'attendance_admin');

CREATE POLICY "Admins can insert devices"
ON attendance.devices FOR INSERT
WITH CHECK (auth.role() = 'attendance_admin');
