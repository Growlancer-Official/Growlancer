-- Create portfolio_items table — separate from services table
-- Portfolio items are showcase pieces, not sellable services

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  project_url TEXT,
  tags TEXT[] DEFAULT '{}',
  technologies_used TEXT[] DEFAULT '{}',
  media_urls TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read any portfolio item (public showcase)
CREATE POLICY "Portfolio items are viewable by everyone"
  ON public.portfolio_items
  FOR SELECT
  USING (true);

-- RLS: Users can only insert their own portfolio items
CREATE POLICY "Users can create their own portfolio items"
  ON public.portfolio_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only update their own portfolio items
CREATE POLICY "Users can update their own portfolio items"
  ON public.portfolio_items
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS: Users can only delete their own portfolio items
CREATE POLICY "Users can delete their own portfolio items"
  ON public.portfolio_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_id ON public.portfolio_items (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_category ON public.portfolio_items (category);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_featured ON public.portfolio_items (is_featured) WHERE is_featured = true;

-- Enable realtime for portfolio_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_items;
