-- ==============================================================================
-- Migration: Production Customer Support & Ticket Management Architecture
-- Version: 20260924160000
-- Status: PREPARED FOR USER REVIEW (DO NOT EXECUTE UNTIL EXPLICITLY APPROVED)
-- Description: Creates sequence, support_tickets, immutable support_ticket_messages,
--              atomic transactional RPCs (create_support_ticket, customer_reply_to_ticket,
--              admin_reply_and_update_ticket), performance indexes, and hardened RLS policies.
-- ==============================================================================

BEGIN;

-- 1. AUTHORITATIVE TICKET NUMBER SEQUENCE (VSM-10001, VSM-10002, ...)
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START WITH 10001 INCREMENT BY 1;

-- 2. MASTER SUPPORT TICKETS TABLE
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    phone_number TEXT,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_number TEXT,
    category TEXT NOT NULL CHECK (category IN (
        'Order Issue',
        'Payment Issue',
        'Delivery Issue',
        'Product Issue',
        'Return / Refund',
        'Account Issue',
        'General Inquiry',
        'Other'
    )),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
        'OPEN',
        'UNDER_REVIEW',
        'ACTION_TAKEN',
        'RESOLVED',
        'CLOSED'
    )),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN (
        'LOW',
        'NORMAL',
        'HIGH',
        'URGENT'
    )),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- 3. SUPPORT TICKET MESSAGES / IMMUTABLE AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin', 'system')),
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TRIGGER: AUTO-UPDATE TICKET TIMESTAMP ON NEW MESSAGE
CREATE OR REPLACE FUNCTION public.update_support_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.support_tickets
    SET updated_at = now()
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_ticket_timestamp ON public.support_ticket_messages;
CREATE TRIGGER trg_update_ticket_timestamp
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_support_ticket_timestamp();

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON public.support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON public.support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON public.support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_created_at ON public.support_ticket_messages(created_at ASC);

-- 6. ATOMIC TRANSACTIONAL RPC: CREATE SUPPORT TICKET (SINGLE AUTHORITATIVE NUMBER GENERATION)
CREATE OR REPLACE FUNCTION public.create_support_ticket(
    p_category TEXT,
    p_subject TEXT,
    p_description TEXT,
    p_order_id UUID DEFAULT NULL,
    p_order_number TEXT DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_ticket_id UUID;
    v_ticket_number TEXT;
    v_ticket_record RECORD;
BEGIN
    -- Verify authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a support ticket' USING ERRCODE = '42501';
    END IF;

    -- Fetch user identity
    SELECT full_name, email INTO v_customer_name, v_customer_email
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
        v_customer_name := COALESCE(auth.jwt()->>'name', 'Customer');
    END IF;

    IF v_customer_email IS NULL OR TRIM(v_customer_email) = '' THEN
        v_customer_email := COALESCE(auth.jwt()->>'email', 'customer@vendosmith.com');
    END IF;

    -- Validate fields
    IF p_category IS NULL OR TRIM(p_category) = '' THEN
        RAISE EXCEPTION 'Category is required';
    END IF;
    IF p_subject IS NULL OR TRIM(p_subject) = '' THEN
        RAISE EXCEPTION 'Subject is required';
    END IF;
    IF p_description IS NULL OR TRIM(p_description) = '' THEN
        RAISE EXCEPTION 'Description is required';
    END IF;

    -- Single authoritative sequence ticket number
    v_ticket_number := 'VSM-' || LPAD(nextval('public.support_ticket_seq')::TEXT, 5, '0');

    -- Insert into support_tickets
    INSERT INTO public.support_tickets (
        ticket_number,
        user_id,
        customer_name,
        customer_email,
        phone_number,
        order_id,
        order_number,
        category,
        subject,
        description,
        status,
        priority
    ) VALUES (
        v_ticket_number,
        v_user_id,
        v_customer_name,
        v_customer_email,
        p_phone_number,
        p_order_id,
        p_order_number,
        p_category,
        TRIM(p_subject),
        TRIM(p_description),
        'OPEN',
        'NORMAL'
    )
    RETURNING id INTO v_ticket_id;

    -- Insert initial message into immutable support_ticket_messages
    INSERT INTO public.support_ticket_messages (
        ticket_id,
        sender_id,
        sender_role,
        sender_name,
        message
    ) VALUES (
        v_ticket_id,
        v_user_id,
        'customer',
        v_customer_name,
        TRIM(p_description)
    );

    SELECT * INTO v_ticket_record FROM public.support_tickets WHERE id = v_ticket_id;
    RETURN to_jsonb(v_ticket_record);
END;
$$;

-- 7. ATOMIC TRANSACTIONAL RPC: CUSTOMER REPLY TO TICKET
CREATE OR REPLACE FUNCTION public.customer_reply_to_ticket(
    p_ticket_id UUID,
    p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_customer_name TEXT;
    v_ticket RECORD;
    v_msg_record RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_message IS NULL OR TRIM(p_message) = '' THEN
        RAISE EXCEPTION 'Message cannot be empty';
    END IF;

    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_ticket.user_id <> v_user_id THEN
        RAISE EXCEPTION 'Access denied: You do not own this ticket' USING ERRCODE = '42501';
    END IF;

    IF v_ticket.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Cannot reply to a closed ticket';
    END IF;

    SELECT full_name INTO v_customer_name FROM public.profiles WHERE id = v_user_id;
    IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
        v_customer_name := COALESCE(auth.jwt()->>'name', 'Customer');
    END IF;

    INSERT INTO public.support_ticket_messages (
        ticket_id,
        sender_id,
        sender_role,
        sender_name,
        message
    ) VALUES (
        p_ticket_id,
        v_user_id,
        'customer',
        v_customer_name,
        TRIM(p_message)
    )
    RETURNING * INTO v_msg_record;

    -- Update timestamp and automatically re-open ticket if it was resolved/action taken
    UPDATE public.support_tickets
    SET 
        updated_at = now(),
        status = CASE 
            WHEN status IN ('RESOLVED', 'ACTION_TAKEN') THEN 'OPEN'
            ELSE status 
        END
    WHERE id = p_ticket_id;

    RETURN to_jsonb(v_msg_record);
END;
$$;

-- 8. ATOMIC TRANSACTIONAL RPC: ADMIN REPLY & STATUS UPDATE WITH NOTIFICATION
CREATE OR REPLACE FUNCTION public.admin_reply_and_update_ticket(
    p_ticket_id UUID,
    p_message TEXT DEFAULT NULL,
    p_new_status TEXT DEFAULT NULL,
    p_new_priority TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_admin_name TEXT;
    v_ticket RECORD;
    v_notif_title TEXT;
    v_notif_body TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin role required' USING ERRCODE = '42501';
    END IF;

    v_admin_id := auth.uid();
    SELECT full_name INTO v_admin_name FROM public.profiles WHERE id = v_admin_id;
    IF v_admin_name IS NULL OR TRIM(v_admin_name) = '' THEN
        v_admin_name := 'Admin Support';
    END IF;

    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
    END IF;

    -- Update status, priority, and relevant lifecycle timestamps
    UPDATE public.support_tickets
    SET 
        status = COALESCE(p_new_status, status),
        priority = COALESCE(p_new_priority, priority),
        updated_at = now(),
        resolved_at = CASE 
            WHEN p_new_status = 'RESOLVED' AND status <> 'RESOLVED' THEN now()
            WHEN p_new_status IS NOT NULL AND p_new_status <> 'RESOLVED' THEN NULL
            ELSE resolved_at 
        END,
        closed_at = CASE 
            WHEN p_new_status = 'CLOSED' AND status <> 'CLOSED' THEN now()
            WHEN p_new_status IS NOT NULL AND p_new_status <> 'CLOSED' THEN NULL
            ELSE closed_at 
        END
    WHERE id = p_ticket_id;

    -- If an admin reply message was provided, insert into immutable audit log
    IF p_message IS NOT NULL AND TRIM(p_message) <> '' THEN
        INSERT INTO public.support_ticket_messages (
            ticket_id,
            sender_id,
            sender_role,
            sender_name,
            message
        ) VALUES (
            p_ticket_id,
            v_admin_id,
            'admin',
            v_admin_name,
            TRIM(p_message)
        );
    END IF;

    -- Atomically create customer notification in the same transaction
    IF v_ticket.user_id IS NOT NULL THEN
        IF p_message IS NOT NULL AND TRIM(p_message) <> '' THEN
            v_notif_title := 'Support Reply: #' || v_ticket.ticket_number;
            v_notif_body := 'Support team replied: "' || SUBSTRING(TRIM(p_message) FROM 1 FOR 80) || CASE WHEN LENGTH(TRIM(p_message)) > 80 THEN '...' ELSE '' END || '"';
        ELSE
            v_notif_title := 'Ticket Status Update: #' || v_ticket.ticket_number;
            v_notif_body := 'Your ticket status has been updated to ' || COALESCE(p_new_status, v_ticket.status);
        END IF;

        INSERT INTO public.customer_notifications (
            user_id,
            title,
            message,
            type,
            priority,
            link_url,
            metadata
        ) VALUES (
            v_ticket.user_id,
            v_notif_title,
            v_notif_body,
            'system',
            'high',
            '/support?ticket=' || v_ticket.ticket_number,
            jsonb_build_object('ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number)
        );
    END IF;

    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
    RETURN to_jsonb(v_ticket);
END;
$$;

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- 9a. support_tickets RLS
DROP POLICY IF EXISTS "Customers view own support tickets" ON public.support_tickets;
CREATE POLICY "Customers view own support tickets"
ON public.support_tickets FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Customers insert own support tickets" ON public.support_tickets;
CREATE POLICY "Customers insert own support tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Customers have NO UPDATE or DELETE on support_tickets (denied by default)

DROP POLICY IF EXISTS "Admin full access support tickets" ON public.support_tickets;
CREATE POLICY "Admin full access support tickets"
ON public.support_tickets FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9b. support_ticket_messages RLS (IMMUTABLE AUDIT LOG)
DROP POLICY IF EXISTS "Customers view messages of own tickets" ON public.support_ticket_messages;
CREATE POLICY "Customers view messages of own tickets"
ON public.support_ticket_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.support_tickets 
        WHERE support_tickets.id = support_ticket_messages.ticket_id 
        AND support_tickets.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Customers insert messages to own open tickets" ON public.support_ticket_messages;
CREATE POLICY "Customers insert messages to own open tickets"
ON public.support_ticket_messages FOR INSERT
WITH CHECK (
    sender_role = 'customer'
    AND sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.support_tickets 
        WHERE support_tickets.id = ticket_id 
        AND support_tickets.user_id = auth.uid()
        AND support_tickets.status <> 'CLOSED'
    )
);

DROP POLICY IF EXISTS "Admin view all ticket messages" ON public.support_ticket_messages;
CREATE POLICY "Admin view all ticket messages"
ON public.support_ticket_messages FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "Admin insert ticket messages" ON public.support_ticket_messages;
CREATE POLICY "Admin insert ticket messages"
ON public.support_ticket_messages FOR INSERT
WITH CHECK (
    public.is_admin()
    AND sender_role = 'admin'
    AND sender_id = auth.uid()
);

-- STRICT IMMUTABILITY: Neither customers nor admins can UPDATE or DELETE historical messages
-- (No UPDATE policy and No DELETE policy created on public.support_ticket_messages)

COMMIT;
