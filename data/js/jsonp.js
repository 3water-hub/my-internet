/**
 * 网络请求 helper。
 *
 * 东方财富公开接口均返回 `Access-Control-Allow-Origin: *`，因此优先用 CORS fetch
 * （不受 ORB / Opaque Resource Blocking 影响，比 JSONP 更可靠）。
 * 若 CORS 被环境拦截，自动回退到 JSONP（<script> 注入）。
 */
window.FA = window.FA || {};

// ---- JSONP（兜底）----
FA.jsonp = (function () {
  let counter = 0;
  function once(url, opts) {
    opts = opts || {};
    const cbParam = opts.cbParam || 'callback';
    const timeout = opts.timeout || 8000;
    const cbName = '__fa_cb_' + (counter++) + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    return new Promise(function (resolve, reject) {
      let settled = false;
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        if (!settled) reject(new Error('JSONP 超时'));
      }, timeout);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cbName] = function (data) { settled = true; cleanup(); resolve(data); };
      script.onerror = function () { cleanup(); if (!settled) reject(new Error('JSONP 网络错误')); };
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      script.src = url + sep + cbParam + '=' + cbName + '&_=' + Date.now();
      document.body.appendChild(script);
    });
  }
  return function (url, opts) {
    opts = opts || {};
    var retry = opts.retry == null ? 1 : opts.retry;
    return once(url, opts).catch(function (err) {
      if (retry > 0) return once(url, Object.assign({}, opts, { retry: 0 }));
      throw err;
    });
  };
})();

// ---- CORS fetch 优先 → 本地代理 → JSONP 三级回退 ----
// datacenter.* 接口发 Access-Control-Allow-Origin: *，CORS 直连即可；
// 但 np-anotice-stock.* 等接口在某些浏览器下 CORS 被拦截、JSONP 又被 ORB
// (Opaque Resource Blocking) 拒绝，此时通过本地 serve.ps1 的 /proxy 路由
// 服务端转发可绕开限制（same-origin，不受 CORS/ORB 约束）。
FA.request = function (url, opts) {
  opts = opts || {};
  var cbParam = opts.cbParam || 'callback';
  var timeout = opts.timeout || 9000;

  function corsFetch() {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
    return fetch(url, { mode: 'cors', signal: controller ? controller.signal : undefined })
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  function proxyFetch() {
    // 仅在本地服务器环境下启用（file:// 或非 localhost 无意义）
    if (!/^https?:\/\/localhost/.test(window.location.origin)) {
      return Promise.reject(new Error('proxy unavailable (not localhost)'));
    }
    var proxyUrl = '/proxy?url=' + encodeURIComponent(url);
    return fetch(proxyUrl, { mode: 'same-origin' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Proxy HTTP ' + resp.status);
        return resp.json();
      });
  }

  return corsFetch()
    .catch(function () { return proxyFetch(); })        // CORS 失败 → 本地代理
    .catch(function () { return FA.jsonp(url, { cbParam: cbParam, timeout: timeout, retry: 1 }); }); // 代理失败 → JSONP
};
