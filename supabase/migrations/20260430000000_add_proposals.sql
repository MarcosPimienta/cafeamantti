-- Create proposals table
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subtitle TEXT,
    content JSONB NOT NULL, -- Array of { title: string, text: string }
    status TEXT NOT NULL DEFAULT 'Borrador' CHECK (status IN ('Borrador', 'Enviada', 'Aprobada', 'Rechazada')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Policies for admins
CREATE POLICY "Admins can manage all proposals" 
    ON public.proposals FOR ALL 
    USING (public.is_admin());

-- Trigger for updated_at
CREATE TRIGGER on_proposals_updated
    BEFORE UPDATE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
