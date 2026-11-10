BEGIN;

-- TRIGGER TO ENFORCE SELLER ORDER TIMELINE INSERTIONS
CREATE OR REPLACE FUNCTION public.enforce_order_timeline_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_order_status TEXT;
BEGIN
  -- Admin users are completely unrestricted
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Fetch current internal_status of the order
  SELECT internal_status INTO current_order_status
  FROM public.orders
  WHERE id = NEW.order_id;

  -- Validate seller allowed timeline transitions:
  -- ORDERED -> CONFIRMED
  -- CONFIRMED -> READY TO DISPATCH
  IF NEW.status = 'ORDERED' OR
     (current_order_status = 'ORDERED' AND NEW.status = 'CONFIRMED') OR
     (current_order_status = 'CONFIRMED' AND NEW.status = 'READY TO DISPATCH') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Seller cannot insert timeline event with status % for order currently in status %.', NEW.status, current_order_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
