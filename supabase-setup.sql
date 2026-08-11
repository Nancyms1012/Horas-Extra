-- ============================================
-- OVERTIME TRACKER - Supabase Database Setup
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Tabla de configuración del usuario
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    work_start TEXT DEFAULT '08:00',
    work_end TEXT DEFAULT '17:00',
    work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
    salary DECIMAL(12,2) DEFAULT 0,
    currency TEXT DEFAULT '$',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Tabla de registros de horas extra
CREATE TABLE IF NOT EXISTS overtime_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT,
    is_holiday BOOLEAN DEFAULT FALSE,
    overtime_minutes INTEGER DEFAULT 0,
    amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Tabla de cortes de período
CREATE TABLE IF NOT EXISTS period_cuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    cut_date DATE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_minutes INTEGER DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    entries_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) - cada usuario solo ve sus datos
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_cuts ENABLE ROW LEVEL SECURITY;

-- Políticas para user_settings
CREATE POLICY "Users can view own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para overtime_entries
CREATE POLICY "Users can view own entries" ON overtime_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries" ON overtime_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries" ON overtime_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries" ON overtime_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Políticas para period_cuts
CREATE POLICY "Users can view own cuts" ON period_cuts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cuts" ON period_cuts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cuts" ON period_cuts
    FOR DELETE USING (auth.uid() = user_id);
