CREATE OR REPLACE FUNCTION attendance.check_employee_access(employee_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM attendance.employees
    WHERE id = employee_id AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION attendance.log_access(employee_id uuid, action text)
RETURNS VOID AS $$
BEGIN
  INSERT INTO attendance.access_logs (employee_id, action, ip_address)
  VALUES (employee_id, action, inet_client_addr());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION attendance.get_attendance_events(employee_id uuid)
RETURNS SETOF attendance.attendance_events AS $$
BEGIN
  IF NOT attendance.check_employee_access(employee_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  attendance.log_access(employee_id, 'view_attendance');

  RETURN QUERY
  SELECT * FROM attendance.attendance_events
  WHERE employee_id = employee_id
  ORDER BY captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
