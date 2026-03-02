/**
 * 访问数统计JS
*/
(function () {
  const ApiUrl = '/api/visitor-count';
  const SiteKey = 'SiteUV';
  const Target = window.location.hostname + window.location.pathname;
  const PageKey = 'PageUV_' + Target;

  function setCookie(name, value, days) {
    var exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/`;
  }
  function getCookie(name) {
    return document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith(name + '='))?.slice(name.length + 1) || null;
  }

  async function visitStat() {
    let isPageNew = !getCookie(PageKey);
    let isSiteNew = !getCookie(SiteKey);

    await fetch(ApiUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Target })
    });
    if (isPageNew) {
      await fetch(ApiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Target, NewVisitor: true })
      });
      setCookie(PageKey, '1', 365);
    }
    if (isSiteNew) setCookie(SiteKey, '1', 365);

    const Res = await fetch(ApiUrl, {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Target': Target }
    });
    if (!Res.ok) return;
    const Data = await Res.json();
    updateStatistics(Data);
  }

  function updateStatistics(Data) {
    setTxt('PageMeter_site_uv', Data.Site?.VisitorCount);
    setTxt('PageMeter_site_pv', Data.Site?.VisitCount);
    setTxt('PageMeter_page_uv', Data.Page?.VisitorCount);
    setTxt('PageMeter_page_pv', Data.Page?.VisitCount);
  }
  function setTxt(Id, Val) {
    const Ele = document.getElementById(Id);
    if (Ele) Ele.textContent = Val || 0;
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', visitStat);
  else visitStat();
})();