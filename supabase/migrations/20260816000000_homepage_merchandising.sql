-- Migration: Homepage Merchandising Engine & Dynamic Configuration
-- Created: 2026-08-16

-- 1. Extend hero_slides with mobile_image_url and start/end dates
ALTER TABLE public.hero_slides ADD COLUMN IF NOT EXISTS mobile_image_url TEXT;
ALTER TABLE public.hero_slides ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.hero_slides ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- 2. Create homepage_sections table for admin-configurable homepage blocks
CREATE TABLE IF NOT EXISTS public.homepage_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    section_type TEXT NOT NULL, -- 'special_collection', 'spotlight_banners', 'product_grid', 'category_rows'
    banner_url TEXT,
    target_link TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast public reads ordered by display priority
CREATE INDEX IF NOT EXISTS idx_homepage_sections_active_sort ON public.homepage_sections(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hero_slides_active_sort ON public.hero_slides(is_active, sort_order);

-- Auto update timestamp trigger
DROP TRIGGER IF EXISTS update_homepage_sections_updated_at ON public.homepage_sections;
CREATE TRIGGER update_homepage_sections_updated_at BEFORE UPDATE ON public.homepage_sections FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- RLS Security
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

-- Public READ for hero_slides
DROP POLICY IF EXISTS "Public read access for hero_slides" ON public.hero_slides;
CREATE POLICY "Public read access for hero_slides" ON public.hero_slides FOR SELECT USING (true);

-- Admin FULL ACCESS for hero_slides
DROP POLICY IF EXISTS "Admin full access for hero_slides" ON public.hero_slides;
CREATE POLICY "Admin full access for hero_slides" ON public.hero_slides USING (is_admin());

-- Public READ for homepage_sections
DROP POLICY IF EXISTS "Public read access for homepage_sections" ON public.homepage_sections;
CREATE POLICY "Public read access for homepage_sections" ON public.homepage_sections FOR SELECT USING (true);

-- Admin FULL ACCESS for homepage_sections
DROP POLICY IF EXISTS "Admin full access for homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admin full access for homepage_sections" ON public.homepage_sections USING (is_admin());
