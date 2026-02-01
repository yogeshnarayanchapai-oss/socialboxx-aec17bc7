-- Create app roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'agent');

-- Create user roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create connected pages table (Facebook Pages)
CREATE TABLE public.connected_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id TEXT NOT NULL UNIQUE,
    page_name TEXT NOT NULL,
    page_access_token TEXT NOT NULL,
    token_expiry TIMESTAMP WITH TIME ZONE,
    connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    connection_status TEXT NOT NULL DEFAULT 'active',
    page_picture_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.connected_pages ENABLE ROW LEVEL SECURITY;

-- Create conversations table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES public.connected_pages(id) ON DELETE CASCADE NOT NULL,
    external_conversation_id TEXT NOT NULL,
    participant_name TEXT,
    participant_id TEXT,
    participant_picture_url TEXT,
    status TEXT NOT NULL DEFAULT 'unreplied',
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP WITH TIME ZONE,
    last_message_preview TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (page_id, external_conversation_id)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Create messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    external_message_id TEXT,
    sender_type TEXT NOT NULL, -- 'customer' or 'page'
    content TEXT,
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'video', 'attachment'
    media_url TEXT,
    is_internal_note BOOLEAN DEFAULT false,
    sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create leads table
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT,
    phone TEXT,
    page_id UUID REFERENCES public.connected_pages(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    last_message TEXT,
    status TEXT NOT NULL DEFAULT 'new', -- 'new', 'hot', 'follow_up', 'closed'
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    followup_due_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create automation rules table
CREATE TABLE public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    page_id UUID REFERENCES public.connected_pages(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL, -- 'new_message', 'keyword_match', 'no_reply_timeout', 'followup_due'
    trigger_config JSONB DEFAULT '{}',
    conditions JSONB DEFAULT '{}',
    actions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    auto_send BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- Create reply templates table
CREATE TABLE public.reply_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general', -- 'general', 'followup', 'cod', 'tracking'
    content TEXT NOT NULL,
    placeholders TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

-- Create settings table
CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}',
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies

-- Profiles: users can view and update their own
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles: admins can manage, users can view own
CREATE POLICY "Users can view own role" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Admins can manage roles" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Connected pages: authenticated users can view, admins can manage
CREATE POLICY "Authenticated users can view pages" ON public.connected_pages
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Admins can manage pages" ON public.connected_pages
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Conversations: authenticated users can view
CREATE POLICY "Authenticated users can view conversations" ON public.conversations
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Authenticated users can update conversations" ON public.conversations
    FOR UPDATE TO authenticated USING (true);

-- Messages: authenticated users can view and create
CREATE POLICY "Authenticated users can view messages" ON public.messages
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Authenticated users can create messages" ON public.messages
    FOR INSERT TO authenticated WITH CHECK (true);

-- Leads: authenticated users can manage
CREATE POLICY "Authenticated users can view leads" ON public.leads
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Authenticated users can manage leads" ON public.leads
    FOR ALL TO authenticated USING (true);

-- Automation rules: admins can manage
CREATE POLICY "Authenticated users can view rules" ON public.automation_rules
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Admins can manage rules" ON public.automation_rules
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Reply templates: authenticated users can view, admins can manage
CREATE POLICY "Authenticated users can view templates" ON public.reply_templates
    FOR SELECT TO authenticated USING (true);
    
CREATE POLICY "Admins can manage templates" ON public.reply_templates
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- App settings: admins only
CREATE POLICY "Admins can manage settings" ON public.app_settings
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for auto profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'admin');
  
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_connected_pages_updated_at BEFORE UPDATE ON public.connected_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reply_templates_updated_at BEFORE UPDATE ON public.reply_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;