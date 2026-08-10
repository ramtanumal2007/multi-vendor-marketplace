BEGIN;

-- Ensure public.is_admin() helper returns true for service_role as well as authenticated admin profiles
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  -- Service role key / postgres superuser bypass
  IF current_setting('role', true) = 'service_role' OR auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
