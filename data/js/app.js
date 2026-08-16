/**
 * 编排层：搜索 → 选中公司 → 并行拉取 → 渲染 5 个 Tab。
 * 图表在切换到对应 Tab 时才渲染（ECharts 需可见容器才能正确测量尺寸）。
 */
window.FA = window.FA || {};
FA.app = (function () {
  var A = FA.analysis;
  var F = FA.fmt;
  var api = FA.api;
  var charts = FA.charts;

  var state = {
    company: null,
    annualInd: [], annualInc: [], annualBal: [], annualCf: [],
    annList: [],
    loaded: { ind: false, inc: false, bal: false, cf: false, ann: false },
    activeTab: 'overview',
    analysisYear: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    var input = $('search-input');
    var box = $('suggest-box');
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (!q) { box.innerHTML = ''; box.style.display = 'none'; return; }
      timer = setTimeout(function () { doSuggest(q); }, 250);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = box.querySelector('.suggest-item');
        if (first) first.click();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) box.style.display = 'none';
    });
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { selectTab(this.dataset.tab); });
    }
    if (new URLSearchParams(location.search).has('selftest')) {
      setTimeout(function () { selftest(); }, 300);
    }
  }

  async function doSuggest(q) {
    try {
      var list = await api.search(q);
      renderSuggest(list);
    } catch (e) { /* 静默 */ }
  }

  function renderSuggest(list) {
    var box = $('suggest-box');
    if (!list.length) {
      box.innerHTML = '<div class="suggest-empty">未找到 A 股 / 港股匹配项</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = list.slice(0, 8).map(function (c) {
      return '<div class="suggest-item" data-code="' + esc(c.code) + '" data-name="' + esc(c.name) +
        '" data-secucode="' + esc(c.secucode) + '" data-exchange="' + esc(c.exchange) + '">' +
        '<span class="si-name">' + esc(c.name) + '</span>' +
        '<span class="si-code">' + esc(c.code) + '.' + esc(c.exchange) + '</span></div>';
    }).join('');
    box.style.display = 'block';
    var items = box.querySelectorAll('.suggest-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function () {
        selectCompany({
          code: this.dataset.code, name: this.dataset.name,
          secucode: this.dataset.secucode, exchange: this.dataset.exchange
        });
      });
    }
  }

  async function selectCompany(c) {
    $('search-input').value = c.name;
    $('suggest-box').style.display = 'none';
    state.company = c;
    api.clearCache();
    showLoading(true);
    $('empty-state').hidden = true;
    $('content').hidden = false;

    var isHK = c.exchange === 'HK';
    var indData, incData, balData, cfData, annData;

    if (isHK) {
      // 港股：source=F10，SECUCODE 带 .HK；公告用 ann_type=H
      var hkRes = await Promise.allSettled([
        api.hkMainIndicators(c.code), api.hkIncome(c.code), api.hkBalance(c.code),
        api.hkCashflow(c.code), api.hkAnnouncements(c.code)
      ]);
      state.loaded = {
        ind: hkRes[0].status === 'fulfilled',
        inc: hkRes[1].status === 'fulfilled',
        bal: hkRes[2].status === 'fulfilled',
        cf: hkRes[3].status === 'fulfilled',
        ann: hkRes[4].status === 'fulfilled'
      };
      indData = state.loaded.ind ? hkRes[0].value : [];
      incData = state.loaded.inc ? hkRes[1].value : [];
      balData = state.loaded.bal ? hkRes[2].value : [];
      cfData = state.loaded.cf ? hkRes[3].value : [];
      annData = state.loaded.ann ? hkRes[4].value : [];

      state.annualInd = A.hkIndicatorAnnual(indData);
      state.annualInc = A.hkIncomeAnnual(incData, indData);
      state.annualBal = A.hkBalanceAnnual(balData);
      state.annualCf = A.hkCashflowAnnual(cfData);
      state.annList = annData;
      state.company.industry = '';
    } else {
      // A 股
      var results = await Promise.allSettled([
        api.mainIndicators(c.code), api.income(c.code), api.balance(c.code),
        api.cashflow(c.code), api.announcements(c.code)
      ]);
      state.loaded = { ind: results[0].status === 'fulfilled', inc: results[1].status === 'fulfilled', bal: results[2].status === 'fulfilled', cf: results[3].status === 'fulfilled', ann: results[4].status === 'fulfilled' };
      indData = state.loaded.ind ? results[0].value : [];
      incData = state.loaded.inc ? results[1].value : [];
      balData = state.loaded.bal ? results[2].value : [];
      cfData = state.loaded.cf ? results[3].value : [];
      annData = state.loaded.ann ? results[4].value : [];

      state.annualInd = A.indicatorAnnual(indData);
      state.annualInc = A.incomeAnnual(incData);
      state.annualBal = A.balanceAnnual(balData);
      state.annualCf = A.cashflowAnnual(cfData);
      state.annList = annData;

      var industry = (indData[0] && indData[0].BOARD_NAME) || (incData[0] && incData[0].INDUSTRY_NAME) || '';
      state.company.industry = industry;
    }

    state.analysisYear = null;
    renderHeader();
    renderOverview();
    renderIncome();
    renderBalance();
    renderCashflow();
    renderAnalysis();
    selectTab('overview');
    showLoading(false);

    if (!state.loaded.ind && !state.loaded.inc) {
      $('content').hidden = true;
      $('empty-state').hidden = false;
      $('empty-state').innerHTML = '<div class="err-state">⚠️ 数据加载失败，可能是网络问题或 file:// 下的跨域限制。<br>请尝试用 <b>VS Code Live Server</b>（右键 index.html → Open with Live Server）打开后重试。</div>';
    }
  }

  function showLoading(on) { $('loading').style.display = on ? 'block' : 'none'; }

  function renderHeader() {
    var c = state.company;
    var latest = state.annualInd[state.annualInd.length - 1] || {};
    $('company-header').innerHTML =
      '<div class="ch-name">' + esc(c.name) +
      '<span class="ch-code">' + esc(c.secucode) + '</span></div>' +
      '<div class="ch-meta">' +
      (c.industry ? '<span>行业：' + esc(c.industry) + '</span>' : '') +
      (latest.reportDate ? '<span>最新年报：' + esc(latest.reportDate.slice(0, 10)) + '</span>' : '') +
      '</div>';
  }

  // ---------- 概览 ----------
  function renderOverview() {
    var arr = state.annualInd;
    var last = arr[arr.length - 1];
    if (last) {
      $('ov-kpis').innerHTML = kpiCard('营业总收入', F.yuan(last.revenue), F.signedPct(last.yoyRev)) +
        kpiCard('归母净利润', F.yuan(last.netProfit), F.signedPct(last.yoyNP)) +
        kpiCard('销售毛利率', F.pct(last.grossMargin), null) +
        kpiCard('加权ROE', F.pct(last.roe), null);
    } else {
      $('ov-kpis').innerHTML = dataFailNote('主要指标');
    }
    // 指标表
    var head = ['年度', '营业总收入(亿)', '营收同比', '归母净利润(亿)', '净利润同比', '毛利率', '净利率', 'ROE', 'EPS', '每股经营现金流', '分红方案'];
    var rows = arr.slice().reverse().map(function (a) {
      return [a.year, F.fixed(F.yi(a.revenue)), F.signedPct(a.yoyRev), F.fixed(F.yi(a.netProfit)), F.signedPct(a.yoyNP),
      F.pct(a.grossMargin), F.pct(a.netMargin), F.pct(a.roe), F.fixed(a.eps), F.fixed(a.ocfPerShare), esc(a.assign || '—')];
    });
    $('ov-table').innerHTML = table(head, rows);
  }

  function kpiCard(label, value, sub) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (sub != null ? '<div class="kpi-sub ' + (sub.indexOf('-') >= 0 && sub !== '—' ? 'down' : 'up') + '">' + (sub === '—' ? '' : '同比 ') + sub + '</div>' : '') + '</div>';
  }

  // ---------- 利润表 ----------
  function renderIncome() {
    if (!state.loaded.inc) { $('income-panel').innerHTML = dataFailNote('利润表'); return; }
    var arr = state.annualInc;
    var head = ['年度', '营业总收入', '营业总成本', '营业成本', '税金及附加', '销售费用', '管理费用', '财务费用', '营业利润', '利润总额', '所得税', '归母净利润', '扣非净利润'];
    var rows = arr.slice().reverse().map(function (a) {
      return [a.year, F.yuan(a.revenue), F.yuan(a.totalCost), F.yuan(a.operateCost), F.yuan(a.operateTaxAdd),
      F.yuan(a.saleExpense), F.yuan(a.manageExpense), F.yuan(a.financeExpense), F.yuan(a.operateProfit),
      F.yuan(a.totalProfit), F.yuan(a.incomeTax), F.yuan(a.netProfit), F.yuan(a.deductNP)];
    });
    $('income-panel').innerHTML = '<div class="card"><table class="fin-table">' + thead(head) + tbody(rows) + '</table></div>';
  }

  // ---------- 资产负债表 ----------
  function renderBalance() {
    if (!state.loaded.bal) { $('balance-panel').innerHTML = dataFailNote('资产负债表'); return; }
    var arr = state.annualBal;
    var head = ['年度', '总资产', '货币资金', '应收账款', '存货', '总负债', '应付账款', '股东权益', '流动比率(%)', '资产负债率(%)'];
    var rows = arr.slice().reverse().map(function (a) {
      return [a.year, F.yuan(a.totalAssets), F.yuan(a.monetaryFunds), F.yuan(a.accountsRece), F.yuan(a.inventory),
      F.yuan(a.totalLiabilities), F.yuan(a.accountsPayable), F.yuan(a.totalEquity), F.fixed(a.currentRatio), F.fixed(a.debtAssetRatio)];
    });
    $('balance-panel').innerHTML = '<div class="card"><table class="fin-table">' + thead(head) + tbody(rows) + '</table></div>';
  }

  // ---------- 现金流量表 ----------
  function renderCashflow() {
    if (!state.loaded.cf) { $('cashflow-panel').innerHTML = dataFailNote('现金流量表'); return; }
    var html = '<div class="card chart-card"><div class="chart" id="cf-chart"></div></div>';
    var arr = state.annualCf;
    var head = ['年度', '经营现金流净额', '销售商品收到的现金', '支付职工现金', '投资现金流净额', '筹资现金流净额', '现金及等价物净增加额'];
    var rows = arr.slice().reverse().map(function (a) {
      return [a.year, F.yuan(a.netcashOperate), F.yuan(a.salesServices), F.yuan(a.payStaffCash),
      F.yuan(a.netcashInvest), F.yuan(a.netcashFinance), F.yuan(a.cceAdd)];
    });
    html += '<div class="card"><table class="fin-table">' + thead(head) + tbody(rows) + '</table></div>';
    $('cashflow-panel').innerHTML = html;
  }

  // ---------- 涨跌分析 ----------
  function renderAnalysis() {
    var arr = state.annualInc;
    if (!state.loaded.inc || arr.length < 2) {
      $('analysis-panel').innerHTML = state.loaded.inc ? '<div class="card note">利润表历史数据不足 2 年，无法做归因分析。</div>' : dataFailNote('利润表');
      return;
    }
    // 年份选择器（降序，需有上一年）
    var opts = '';
    for (var i = arr.length - 1; i >= 1; i--) {
      opts += '<option value="' + arr[i].year + '">' + arr[i].year + '年 vs ' + arr[i - 1].year + '年</option>';
    }
    var sel = '<div class="card ctrl-bar"><label>分析区间：</label><select id="analysis-year">' + opts + '</select></div>';
    $('analysis-panel').innerHTML = sel +
      '<div class="card chart-card"><div class="chart" id="attr-chart"></div></div>' +
      '<div class="card" id="attr-narrative"></div>' +
      '<div class="card" id="attr-table"></div>' +
      '<div class="card" id="attr-validate"></div>' +
      '<div class="card" id="attr-events"></div>';
    $('analysis-year').addEventListener('change', function () { updateAnalysis(this.value); });
    var y = state.analysisYear || arr[arr.length - 1].year;
    state.analysisYear = y;
    $('analysis-year').value = y;
    updateAnalysis(y);
  }

  function updateAnalysis(year) {
    state.analysisYear = year;
    var arr = state.annualInc;
    var idx = arr.findIndex(function (a) { return a.year === year; });
    if (idx < 1) return;
    var curr = arr[idx], prev = arr[idx - 1];
    var attr = A.attributeProfit(curr, prev, state.company.industry);

    // 叙事
    var narr = A.narrative(state.company, attr);
    $('attr-narrative').innerHTML = '<div class="card-title">📊 涨跌原因分析（' + esc(year) + '年）</div>' +
      '<div class="narrative">' + esc(narr).replace(/\n/g, '<br>') + '</div>';

    // 归因表
    var head = ['分项', '影响额(亿)', '对净利润贡献'];
    var rows = attr.items.map(function (it) {
      return [it.label + (it.residual ? ' *' : ''), F.fixed(F.yi(it.value)), it.pp == null ? '—' : F.signedPct(it.pp)];
    });
    rows.push(['净利润变动合计', F.fixed(F.yi(attr.dNP)), attr.prevNP ? F.signedPct(attr.dNP / attr.prevNP * 100) : '—']);
    var note = attr.mode === 'financial' ? '<div class="hint">金融业简版归因（未拆分毛利率/营业成本）。* 为残差，含营业外收支/投资收益/减值/研发等未单独列示项。</div>'
      : (attr.cogsUsed ? '<div class="hint">毛利率桥接分解（ΔGP = GM₀·ΔRev + ΔGM·Rev₁）。* 为残差，含营业外收支/投资收益/减值/研发等未单独列示项。</div>'
        : '<div class="hint">COGS 字段缺失或异常，采用简版分解。* 为残差。</div>');
    $('attr-table').innerHTML = '<div class="card-title">归因分解表</div>' + table(head, rows) + note;

    // 校验表
    var checks = A.validateRatios(curr, prev);
    if (checks.length) {
      var ch = ['指标', '自算同比(%)', '接口同比(%)', '偏差(pp)'];
      var cr = checks.map(function (c) { return [c.label, F.fixed(c.calc), F.fixed(c.ratio), F.fixed(c.diff)]; });
      $('attr-validate').innerHTML = '<div class="card-title">数据交叉校验</div>' + table(ch, cr) +
        '<div class="hint">自算同比与接口返回 *_RATIO 应基本一致（偏差 &lt; 0.5pp 为正常）。</div>';
    } else {
      $('attr-validate').innerHTML = '';
    }

    // 事件
    var evs = A.eventsByPeriod(state.annList, curr.reportDate, 120, state.company.code);
    var evHtml;
    if (!state.loaded.ann) {
      evHtml = isStaticHost()
        ? '<div class="card note">📌 公告接口需服务器代理，当前（静态托管）环境下受跨域限制暂不可用。本地运行 <code>serve.ps1</code> 可查看完整公告事件。</div>'
        : dataFailNote('公告');
    } else if (!evs.length) {
      evHtml = '<div class="hint">该报告期前后 120 天内无相关公告。</div>';
    } else {
      evHtml = '<div class="timeline">' + evs.map(function (e) {
        var cls = e.rank <= 2 ? 'ev hi' : (e.rank <= 4 ? 'ev mid' : 'ev');
        var inner = '<span class="ev-date">' + esc(e.date) + '</span>' +
          '<span class="ev-cat">' + esc(e.category) + '</span>' +
          '<span class="ev-title">' + esc(e.title) +
          (e.url ? ' <span class="ev-ext">↗</span>' : '') + '</span>';
        // 整行可点击，新标签页打开东方财富公告原文
        if (e.url) {
          return '<a class="' + cls + ' ev-link" href="' + esc(e.url) +
            '" target="_blank" rel="noopener noreferrer" title="点击查看公告原文">' + inner + '</a>';
        }
        return '<div class="' + cls + '">' + inner + '</div>';
      }).join('') + '</div>';
    }
    $('attr-events').innerHTML = '<div class="card-title">相关事件（报告期 ±120 天公告）</div>' + evHtml +
      '<div class="hint">点击公告可跳转东方财富查看原文。仅按时间关联展示，不构成因果判断。</div>';

    // 瀑布图
    renderAnalysisCharts(attr);
  }

  // ---------- 图表渲染 ----------
  function renderChartsFor(tabId) {
    if (tabId === 'overview') {
      if (state.annualInd.length) {
        charts.revenueProfit($('ov-chart-1'), state.annualInd);
        charts.margins($('ov-chart-2'), state.annualInd);
        charts.expenses($('ov-chart-3'), state.annualInc);
      }
    } else if (tabId === 'cashflow') {
      if (state.annualCf.length) charts.cashflowChart($('cf-chart'), state.annualCf);
    }
  }
  function renderAnalysisCharts(attr) {
    if (attr) charts.attribution($('attr-chart'), attr);
  }

  function selectTab(tabId) {
    state.activeTab = tabId;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].dataset.tab === tabId);
    }
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].id !== 'tab-' + tabId;
    }
    charts.disposeAll();
    // 概览图表在概览 panel 内，renderAnalysisCharts 单独处理分析 tab
    if (tabId === 'overview') renderChartsFor('overview');
    else if (tabId === 'cashflow') renderChartsFor('cashflow');
    else if (tabId === 'analysis') {
      var y = state.analysisYear;
      if (y) {
        var arr = state.annualInc;
        var idx = arr.findIndex(function (a) { return a.year === y; });
        if (idx >= 1) renderAnalysisCharts(A.attributeProfit(arr[idx], arr[idx - 1], state.company.industry));
      }
    }
  }

  // ---------- 表格工具 ----------
  function thead(arr) {
    return '<thead><tr>' + arr.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
  }
  function tbody(rows) {
    return '<tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + (c == null ? '—' : c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
  }
  function table(head, rows) { return '<table class="fin-table">' + thead(head) + tbody(rows) + '</table>'; }
  function isStaticHost() {
    var o = window.location.origin || '';
    return !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(o);
  }
  function dataFailNote(name) {
    return '<div class="card note">⚠️ ' + name + ' 数据加载失败。<a href="#" onclick="FA.app.reloadCurrent();return false;">重试</a></div>';
  }

  function reloadCurrent() {
    if (state.company) selectCompany(state.company);
  }

  // ---------- 自检 ----------
  async function selftest() {
    console.log('[selftest] 开始：贵州茅台 600519');
    await selectCompany({ code: '600519', name: '贵州茅台', secucode: '600519.SH', exchange: 'SH' });
    setTimeout(function () {
      var arr = state.annualInc;
      if (arr.length >= 2) {
        var curr = arr[arr.length - 1], prev = arr[arr.length - 2];
        var attr = A.attributeProfit(curr, prev, state.company.industry);
        var sum = attr.items.reduce(function (s, it) { return s + it.value; }, 0);
        console.log('[selftest] 最新年报归因:', curr.year, 'vs', prev.year);
        console.log('[selftest] ΔNP =', attr.dNP, ' ΣC_i =', sum, ' 残差对账误差 =', attr.dNP - sum);
        console.log('[selftest] 校验:', A.validateRatios(curr, prev));
        console.log('[selftest] 接口加载状态:', state.loaded);
        console.log('[selftest] 事件数(最新报告期):', A.eventsByPeriod(state.annList, curr.reportDate, 120).length);
      }
    }, 1500);
  }

  return { init: init, reloadCurrent: reloadCurrent, selftest: selftest,selectCompany };
})();

document.addEventListener('DOMContentLoaded', FA.app.init);
