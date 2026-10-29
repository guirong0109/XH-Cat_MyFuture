import { esc, tag } from '../ui.js'

const CATS = [['A', 'catA', 'catAText', false], ['B', 'catB', 'catBText', false], ['C', 'catC', 'catCText', true], ['D', 'catD', 'catDText', true]]

export default ({ t, state }) => `<h1>${esc(t('category'))}</h1><p class="lead">${esc(t('categoryLead'))}</p>
<div class="grid g2">${CATS.map(([k, n, d, org]) => `<button class="choice ${state.category === k ? 'sel' : ''} ${org ? 'lock' : ''}" data-act="category" data-arg="${k}"><b>${k} · ${esc(t(n))} ${org ? tag('unv', t('preview')) : ''}</b><span class="small muted">${esc(t(d))}</span></button>`).join('')}</div>`
