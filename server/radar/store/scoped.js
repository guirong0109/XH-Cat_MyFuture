// Restricts a RadarStore to one key prefix (for example demo/<sessionId>/). Anything outside it is refused.
import { StoreError } from '../../store/d1.js'

const notAllowed = () => new StoreError('not_allowed')
const unsafe = (text) => text.startsWith('/') || text.includes('\\') || text.split('/').includes('..')

export function scopedStore(store, prefix) {
  if (typeof prefix !== 'string' || !prefix.endsWith('/') || unsafe(prefix)) throw notAllowed()
  // An object key: inside the prefix, never the prefix itself, no empty or "." segments.
  const checkKey = (key) => {
    if (typeof key !== 'string' || !key.startsWith(prefix) || key === prefix || unsafe(key)) throw notAllowed()
    if (key.slice(prefix.length).split('/').some((part) => part === '' || part === '.')) throw notAllowed()
    return key
  }
  // A listing prefix: the scope prefix or deeper (it may end in a slash).
  const checkListPrefix = (listPrefix) => {
    if (typeof listPrefix !== 'string' || !listPrefix.startsWith(prefix) || unsafe(listPrefix)) throw notAllowed()
    if (listPrefix.slice(prefix.length).split('/').slice(0, -1).some((part) => part === '' || part === '.')) throw notAllowed()
    return listPrefix
  }
  return {
    get: async (key) => store.get(checkKey(key)),
    put: async (key, bytes, options) => store.put(checkKey(key), bytes, options),
    delete: async (key) => store.delete(checkKey(key)),
    list: async (listPrefix = prefix) => (await store.list(checkListPrefix(listPrefix))).filter((key) => key.startsWith(prefix)),
  }
}
