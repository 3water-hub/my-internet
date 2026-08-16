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

  // 公共 CORS 代理兜底（静态托管如 GitHub Pages 下，某些接口 CORS + JSONP 均被浏览器拦截时使用）
  // 注意：corsproxy.io 对外站（非 localhost）返回其官网 HTML，故只保留真实免费且无需 key 的代理：
  // 1) api.allorigins.win/get — 返回 {contents, status} JSON，需要二次提取 contents 再 JSON.parse
  // 2) api.codetabs.com/v1/proxy — 直接返回原始响应（但偶有 Cloudflare 520）
  var PUBLIC_PROXIES = [
    {
      build: function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
      extract: function (raw) {
        if (raw && typeof raw.contents === 'string') {
          try { return JSON.parse(raw.contents); } catch (e) { throw new Error('allorigins JSON parse:' + e.message); }
        }
        throw new Error('allorigins no contents');
      }
    },
    {
      build: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
      extract: function (raw) {
        if (raw == null || typeof raw !== 'object') throw new Error('codetabs empty');
        // codetabs 直接透传原始响应 JSON（当 Content-Type 是 application/json 时）
        return raw;
      }
    }
  ];
  function publicProxyFetch(triedIndex) {
    triedIndex = triedIndex || 0;
    if (triedIndex >= PUBLIC_PROXIES.length) {
      return Promise.reject(new Error('public proxy exhausted'));
    }
    var pxy = PUBLIC_PROXIES[triedIndex];
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
    return fetch(pxy.build(url), { mode: 'cors', signal: controller ? controller.signal : undefined })
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        if (!resp.ok) throw new Error('PubProxy HTTP ' + resp.status);
        return resp.json().then(function (raw) { return pxy.extract(raw); });
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
};
