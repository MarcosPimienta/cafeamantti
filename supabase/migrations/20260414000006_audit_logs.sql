CREATE TABLE IF NOT EXISTS inventory_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    admin_id UUID REFERENCES public.profiles(id),
    action_type VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    entity_type VARCHAR(50) NOT NULL, -- 'MOVEMENT', 'TRILLA_BATCH'
    entity_id UUID,
    inventory_id UUID,
    details JSONB
);

-- RLS
ALTER TABLE inventory_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON inventory_audit_logs
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can insert audit logs" ON inventory_audit_logs
FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin')
);

-- Note: No UPDATE or DELETE policies. Audit logs are immutable.
