// 公共 CORS 代理兜底（静态托管如 GitHub Pages 下，某些接口 CORS + JSONP 均被浏览器拦截时使用）
  var PUBLIC_PROXIES = [
    function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }
  ];
  function publicProxyFetch(triedIndex) {
    triedIndex = triedIndex || 0;
    if (triedIndex >= PUBLIC_PROXIES.length) {
      return Promise.reject(new Error('public proxy exhausted'));
    }
    var pxy = PUBLIC_PROXIES[triedIndex];
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
    return fetch(pxy(url), { mode: 'cors', signal: controller ? controller.signal : undefined })
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        if (!resp.ok) throw new Error('PubProxy HTTP ' + resp.status);
        return resp.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        return publicProxyFetch(triedIndex + 1);
      });
  }

  return corsFetch()
    .catch(function () { return proxyFetch(); })        // ① CORS 失败 → 本地 /proxy
    .catch(function () { return FA.jsonp(url, { cbParam: cbParam, timeout: timeout, retry: 1 }); }) // ② proxy 失败 → JSONP
    .catch(function () { return publicProxyFetch(0); });  // ③ JSONP 被 ORB / 超时 → 公共 CORS 代理（GitHub Pages 等静态托管的最后兜底）
