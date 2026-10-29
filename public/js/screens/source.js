import { esc } from '../ui.js'

export default ({ t }) => `<h1>${esc(t('sourceTitle'))}</h1><p class="lead">${esc(t('sourceLead'))}</p>
<div class="grid g2">
 <button class="choice" data-go="upload"><b>${esc(t('sourceUpload'))}</b><span class="small muted">${esc(t('sourceUploadText'))}</span></button>
 <button class="choice" data-go="form"><b>${esc(t('sourceManual'))}</b><span class="small muted">${esc(t('sourceManualText'))}</span></button>
</div>`
