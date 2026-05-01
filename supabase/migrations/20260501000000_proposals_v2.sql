-- Proposals V2: Add brand identity fields and update content schema
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS ally_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS background_image_url TEXT,
  ADD COLUMN IF NOT EXISTS background_opacity FLOAT DEFAULT 0.15;

-- content JSONB schema now supports typed blocks:
-- { type: 'rich-text' | 'price-table' | 'checklist', title: string, text?: string, items?: [...] }
COMMENT ON COLUMN public.proposals.content IS 
  'Array of typed blocks: {type, title, text?, items?[{item,cost,pvp}|string]}';
