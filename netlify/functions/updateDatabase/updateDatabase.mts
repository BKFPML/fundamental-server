import type { Config } from "@netlify/functions"
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://kilqtdrtuaxyoxkethsv.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)


export default async (req: Request) => {
    const { next_run } = await req.json()
    const { data, error } = await supabase
        .from('exchange_rate')
        .update({ value: 'newValue' })
        .eq('some_column', 'someValue')
        .select();

    console.log("Received event! Next invocation at:", next_run)
}

export const config: Config = {
    schedule: "@hourly"
}
