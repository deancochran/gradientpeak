import { createClient } from '@supabase/supabase-js';
import { profileTrainingSettingsRecordSchema } from '@repo/core';
import * as dotenv from 'dotenv';

dotenv.config({ path: './apps/web/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('profile_training_settings')
    .select('*')
    .eq('profile_id', 'b9f612b8-0db3-4838-9355-5b1b5c039725')
    .single();

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log('Data:', JSON.stringify(data, null, 2));

  const parsed = profileTrainingSettingsRecordSchema.safeParse(data);
  if (!parsed.success) {
    console.error('Validation error:', JSON.stringify(parsed.error.format(), null, 2));
  } else {
    console.log('Success!');
  }
}

run();
