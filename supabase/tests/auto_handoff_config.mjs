// Shared configuration for the First Result auto-handoff acceptance.
// Environment overrides exist so the same acceptance can target an
// isolated stack; every default is byte-identical to the original
// hosted Preview/Staging target, so default behavior never changes.
export function resolveAutoHandoffConfig(env = {}) {
  const REF = env.HANDOFF_SUPABASE_REF || 'vhzryhibmpvglzcmfnaa';
  const ORIGIN = env.HANDOFF_ORIGIN || 'https://growth-os-preview-git-takeover-muse-primary-20261016-morning-ai.vercel.app';
  const base = env.HANDOFF_SUPABASE_URL || `https://${REF}.supabase.co`;
  const PRODUCT_URL = env.HANDOFF_PRODUCT_URL || 'https://woo.novamodule.com/product/happy-ninja/';
  return {REF, ORIGIN, base, PRODUCT_URL};
}
