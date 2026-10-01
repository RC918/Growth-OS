// Deployment draft only; disabled unless BOTH reviewed readiness flags match.
import {createTrialHandler} from '../_shared/model-trial/handler.mjs';
import {supabaseAdapters,openaiProvider} from '../_shared/model-trial/adapters.mjs';
import {POLICY} from '../_shared/model-trial/policy.mjs';
const ready=Deno.env.get('MODEL_TRIAL_READY_POLICY')===POLICY.version&&
 Deno.env.get('MODEL_TRIAL_COUNTING_NO_ADDITIONAL_CHARGE')==='confirmed';
const adapters=supabaseAdapters({publishableKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')});
const provider=openaiProvider({getKey:()=>Deno.env.get('OPENAI_API_KEY')});
Deno.serve(createTrialHandler({...adapters,provider,ready}));
