import { createClient } from '@supabase/supabase-js'

// آدرس پروژه شما (از نوار آدرس مرورگر یا منوی API کپی کن)
const supabaseUrl = 'https://odeqesaumuvuzctumrso.supabase.co'

// ⚠️ کلید Publishable رو با دکمه کپی کنارش کپی کن و کل متن رو اینجا بذار
const supabaseKey = 'sb_publishable_5dbo5ZbDFNcQqQ1_wa_qfQ_WzGcRVHY' 

export const supabase = createClient(supabaseUrl, supabaseKey)