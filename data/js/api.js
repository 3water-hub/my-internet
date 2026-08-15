/**
 * 东方财富公开接口封装（全部 JSONP，免 Key）。
 *  - 搜索：searchapi.eastmoney.com/api/suggest/get  (cb)
 *  - 主要指标/三大报表：datacenter.eastmoney.com/securities/api/data/v1/get (callback)
 *  - 公告：np-anotice-stock.eastmoney.com/api/security/ann (cb)
 * 注：主指标排序字段为 REPORTDATE（无下划线）；三大报表为 REPORT_DATE（带下划线）。
 */
window.FA = window.FA || {};
FA.api = (function () {
  var TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';
  var SEARCH = 'https://searchapi.eastmoney.com/api/suggest/get';
  var DC = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
  var ANN = 'https://np-anotice-stock.eastmoney.com/api/security/ann';
  var cache = new Map();

  function buildQS(obj) {
    return Object.keys(obj)
      .map(function (k) { return k + '=' + encodeURIComponent(obj[k]); })
      .join('&');
  }

  function dcUrl(reportName, code, sortCol, pageSize) {
    return DC + '?' + buildQS({
      reportName: reportName,
      columns: 'ALL',
      filter: '(SECURITY_CODE="' + code + '")',
      pageNumber: 1,
      pageSize: pageSize,
      sortColumns: sortCol,
      sortTypes: -1,
      source: 'HSF10',
      client: 'PC'
    });
  }

  // datacenter 通用请求（带成功结果缓存）
  function dcFetch(reportName, code, sortCol, pageSize, cacheKey) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    var p = FA.request(dcUrl(reportName, code, sortCol, pageSize), { cbParam: 'callback', timeout: 9000 })
      .then(function (res) {
        if (!res || !res.success || !res.result) {
          throw new Error((res && res.message) || '数据接口返回失败');
        }
        return res.result.data || [];
      });
    cache.set(cacheKey, p);
    p.catch(function () { cache.delete(cacheKey); });
    return p;
  }

  function search(keyword) {
    var url = SEARCH + '?input=' + encodeURIComponent(keyword) + '&type=14&token=' + TOKEN + '&count=12';
    return FA.request(url, { cbParam: 'cb', timeout: 8000 }).then(function (res) {
      var data = (res && res.QuotationCodeTable && res.QuotationCodeTable.Data) || [];
      return data
        .filter(function (d) { return d.Classify === 'AStock' || d.Classify === 'HK'; })
        .map(function (d) {
          var ex;
          if (d.Classify === 'HK') ex = 'HK';
          else ex = d.MktNum === '1' ? 'SH' : 'SZ';
          return {
            code: d.Code,
            name: d.Name,
            secucode: d.Code + '.' + ex,
            exchange: ex,
            pinyin: d.PinYin
          };
        });
    });
  }

  function mainIndicators(code) { return dcFetch('RPT_LICO_FN_CPD', code, 'REPORTDATE', 36, 'ind:' + code); }
  function income(code) { return dcFetch('RPT_DMSK_FN_INCOME', code, 'REPORT_DATE', 48, 'inc:' + code); }
  function balance(code) { return dcFetch('RPT_DMSK_FN_BALANCE', code, 'REPORT_DATE', 48, 'bal:' + code); }
  function cashflow(code) { return dcFetch('RPT_DMSK_FN_CASHFLOW', code, 'REPORT_DATE', 48, 'cf:' + code); }

  // ---- 港股 API (source=F10, SECUCODE 带 .HK 后缀) ----
  function hkDcUrl(reportName, code, sortCol, pageSize) {
    // sortTypes 数量必须与 sortColumns 一致，否则接口报 code=9501
    var sortTypes = sortCol.split(',').map(function () { return -1; }).join(',');
    return DC + '?' + buildQS({
      reportName: reportName,
      columns: 'ALL',
      filter: '(SECUCODE="' + code + '.HK")',
      pageNumber: 1,
      pageSize: pageSize,
      sortColumns: sortCol,
      sortTypes: sortTypes,
      source: 'F10',
      client: 'PC'
    });
  }

  function hkDcFetch(reportName, code, sortCol, pageSize, cacheKey) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    var p = FA.request(hkDcUrl(reportName, code, sortCol, pageSize), { cbParam: 'callback', timeout: 9000 })
      .then(function (res) {
        if (!res || !res.success || !res.result) {
          throw new Error((res && res.message) || '数据接口返回失败');
        }
        return res.result.data || [];
      });
    cache.set(cacheKey, p);
    p.catch(function () { cache.delete(cacheKey); });
    return p;
  }

  function hkMainIndicators(code) { return hkDcFetch('RPT_HKF10_FN_MAININDICATOR', code, 'REPORT_DATE', 96, 'hkind:' + code); }
  function hkIncome(code) { return hkDcFetch('RPT_HKF10_FN_INCOME_PC', code, 'REPORT_DATE,STD_ITEM_CODE', 3000, 'hkinc:' + code); }
  function hkBalance(code) { return hkDcFetch('RPT_HKF10_FN_BALANCE_PC', code, 'REPORT_DATE,STD_ITEM_CODE', 3000, 'hkbal:' + code); }
  function hkCashflow(code) { return hkDcFetch('RPT_HKF10_FN_CASHFLOW_PC', code, 'REPORT_DATE,STD_ITEM_CODE', 3000, 'hkcf:' + code); }

  function announcements(code) {
    var url = ANN + '?sr=-1&page_size=100&page_index=1&ann_type=A&client_source=web&stock_list=' + code + '&f_node=0&s_node=0';
    return FA.request(url, { cbParam: 'cb', timeout: 9000 }).then(function (res) {
      return (res && res.data && res.data.list) || [];
    });
  }

  // 港股公告：ann_type=H
  function hkAnnouncements(code) {
    var url = ANN + '?sr=-1&page_size=100&page_index=1&ann_type=H&client_source=web&stock_list=' + code + '&f_node=0&s_node=0';
    return FA.request(url, { cbParam: 'cb', timeout: 9000 }).then(function (res) {
      return (res && res.data && res.data.list) || [];
    });
  }

  function clearCache() { cache.clear(); }

  return {
    search: search,
    mainIndicators: mainIndicators,
    income: income,
    balance: balance,
    cashflow: cashflow,
    announcements: announcements,
    hkAnnouncements: hkAnnouncements,
    hkMainIndicators: hkMainIndicators,
    hkIncome: hkIncome,
    hkBalance: hkBalance,
    hkCashflow: hkCashflow,
    clearCache: clearCache
  };
})();
