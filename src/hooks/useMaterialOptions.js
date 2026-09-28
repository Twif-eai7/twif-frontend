import { supabase } from '../lib/supabase'

// Small, static reference list — fetched once per session and cached at
// module scope (same shape as useSkuCache.js), not scoped per buyer/org.
let _cache = null

export function useMaterialOptions() {
  const getMaterialOptions = async () => {
    if (_cache) return _cache

    const { data, error } = await supabase
      .from('material_options')
      .select('id, category, code, label')
      .order('category')
      .order('sort_order')
    if (error) return []

    _cache = data ?? []
    return _cache
  }

  return { getMaterialOptions }
}
