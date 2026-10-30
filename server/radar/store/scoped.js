// Restricts a RadarStore to one key prefix (for example demo/<sessionId>/). Anything outside it is refused.
import { StoreError } from '../../store/d1.js'

export function scopedStore(store, prefix) {
  const check = (key) => {
    if (typeof key !== 'string' || !key.startsWith(prefix) || key.startsWith('/') || key.includes('\\') || key.split('/').includes('..')) {
      throw new StoreError('not_allowed')
    }
    return key
  }
  return {
    get: async (key) => store.get(check(key)),
    put: async (key, bytes, options) => store.put(check(key), bytes, options),
    delete: async (key) => store.delete(check(key)),
    list: async (listPrefix = prefix) => store.list(check(listPrefix)),
  }
}
