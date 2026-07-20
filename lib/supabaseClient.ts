import { createClient } from '@supabase/supabase-js'

// Supabase publishable keys are public browser configuration (RLS remains the
// authorization boundary). Only installations still pointing at the retired
// project are migrated automatically; a fresh clone without env configuration
// receives an inert client and never connects to the live database by accident.
const FALLBACK_SUPABASE_URL = 'https://uidynyxtaphydgqoxpny.supabase.co'
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RjcvW1-mXQH3KOfsPipJ6w_LDFFBmIZ'
const RETIRED_PROJECT_REF = 'hznpanjkhjdlgsusfxka'
const UNCONFIGURED_SUPABASE_URL = 'https://unconfigured.supabase.co'
const UNCONFIGURED_SUPABASE_KEY = 'sb_publishable_missing_configuration'

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const usesRetiredProject = configuredUrl?.includes(RETIRED_PROJECT_REF)
const supabaseUrl = usesRetiredProject
  ? FALLBACK_SUPABASE_URL
  : configuredUrl ?? UNCONFIGURED_SUPABASE_URL
const supabaseKey = usesRetiredProject
  ? FALLBACK_SUPABASE_PUBLISHABLE_KEY
  : configuredKey ?? UNCONFIGURED_SUPABASE_KEY

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)
