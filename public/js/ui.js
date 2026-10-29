// Small HTML helpers shared by the screens (the mockup's look). Every text put into HTML goes through esc().
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const tag = (kind, text) => `<span class="tag t-${kind}">${esc(text)}</span>`
export const btn = (label, { go, act, arg, kind = '' } = {}) =>
  `<button class="btn ${kind}" ${go ? `data-go="${go}"` : ''} ${act ? `data-act="${act}"` : ''} ${arg !== undefined ? `data-arg="${esc(arg)}"` : ''}>${esc(label)}</button>`
