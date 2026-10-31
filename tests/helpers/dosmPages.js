// Trimmed copies of the DOSM pages (only the parts the adapter reads). Fixtures for tests; never fetched live.
export const RELEASE_BASE = 'https://www.dosm.gov.my/portal-main/release-content/big-data-analytics-job-market-insights-q'
export const ARCHIVE_URL = 'https://www.dosm.gov.my/portal-main/release-archive/big-data-analytics-job-market-insights-q22026'
export const DATA_URL = 'https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742'

const link = (slug, text) =>
  `<h6 class="mt-4" style="font-weight:400;"><a href="/portal-main/release-content/big-data-analytics-job-market-insights-${slug}">${text}</a></h6>`

const OLDER = [
  link('q12026', '25.06.2026 - Big Data Analytics: Job Market Insights, First Quarter of 2026'),
  link('q42025', '25.05.2026 - Big Data Analytics: Job Market Insights, Fourth Quarter of 2025'),
  link('q32025', '28.04.2026 - Big Data Analytics: Job Market Insights, Third Quarter of 2025'),
  link('q22025', '26.02.2026 - Big Data Analytics: Job Market Insights and My Job Profile, Second Quarter of 2025'),
  link('q12025', '30.01.2026 - Big Data Analytics: Job Market Insights and My Job Profile, First Quarter of 2025')
].join('')

const wrap = (items) => `<div class="col-lg-12"><h3>Job Vacancies Advertised Online Archive</h3>${items}</div>`

// Listing without anything later than 2026 Q2 (the real archive does not list the Q2 2026 release itself).
export const ARCHIVE_NO_NEW = wrap(OLDER)

// Listing with a Q3 2026 release (and an unrelated item that must be ignored).
export const ARCHIVE_NEW_Q3 = wrap(
  link('q32026', '19.11.2026 - Big Data Analytics: Job Market Insights, Third Quarter of 2026') +
    link('x', '10.11.2026 - Labour Force Survey, Third Quarter of 2026') +
    OLDER
)

export const RELEASE_PAGE = `<div id="data"  class="mt-40">
        <h5>Data</h5><ol><li>
                <a download="Data JMI Q2 2026" href="${DATA_URL}" target="_blank">
                Data JMI Q2 2026</a>
            </li></ol></div><div id="press_statement" class="mt-40"><h5>Press Statement</h5><div>
                <a href="https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20743" target="_blank">Press</a>
            </div></div>`

export const RELEASE_PAGE_NO_DATA = `<div id="press_statement" class="mt-40"><h5>Press Statement</h5><div>
    <a href="https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20743">Press</a></div></div>`
