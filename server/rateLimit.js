// "At most `limit` hits per key in a sliding window" (sign-in, sign-up, uploads, searches, AI runs). Keys whose
// window has passed are forgotten once more than `maxKeys` are held, so memory stays bounded.
export function createWindowLimiter({ limit, windowMs, now = () => Date.now(), maxKeys = 10000 }) {
  const hits = new Map()
  const time = () => (typeof now() === 'number' ? now() : now().getTime())

  function sweep(at) {
    for (const [key, list] of hits) if (!list.some((t) => at - t < windowMs)) hits.delete(key)
  }

  // Records a hit and says whether it is allowed. A refused hit is not counted.
  function hit(key) {
    const at = time()
    if (hits.size >= maxKeys) sweep(at)
    const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return false
    }
    hits.set(key, [...recent, at])
    return true
  }

  return { hit, size: () => hits.size }
}
