/**
 * ECharts 图表构建。CDN 加载失败时降级为提示（核心信息仍由表格呈现）。
 * 所有实例注册到统一列表，支持 resize / dispose。
 */
window.FA = window.FA || {};
FA.charts = (function () {
  var fmt = FA.fmt;
  var instances = [];

  function available() { return typeof window.echarts !== 'undefined'; }

  function make(dom, option) {
    if (!dom) return null;
    if (!available()) {
      dom.innerHTML = '<div class="no-chart">⚠️ ECharts 未加载（CDN 失败），请查看下方表格数据。</div>';
      return null;
    }
    var ch = echarts.init(dom);
    ch.setOption(option);
    instances.push(ch);
    return ch;
  }

  var baseGrid = { left: 56, right: 24, top: 40, bottom: 36, containLabel: true };
  var axisLine = { lineStyle: { color: '#cdd3dc' } };
  var splitLine = { lineStyle: { color: '#eef1f7' } };
  var baseText = { fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif' };

  function revenueProfit(dom, annual) {
    var years = annual.map(function (a) { return a.year; });
    var rev = annual.map(function (a) { return fmt.yi(a.revenue); });
    var np = annual.map(function (a) { return fmt.yi(a.netProfit); });
    return make(dom, {
      color: ['#4f7cff', '#f5a623'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: function (v) { return v == null ? '—' : v + ' 亿'; } },
      legend: { data: ['营业总收入', '归母净利润'], top: 6, textStyle: baseText },
      grid: baseGrid,
      xAxis: { type: 'category', data: years, axisLine: axisLine, axisLabel: baseText },
      yAxis: [
        { type: 'value', name: '亿元', axisLine: axisLine, splitLine: splitLine, axisLabel: baseText },
        { type: 'value', name: '亿元', axisLine: axisLine, splitLine: { show: false }, axisLabel: baseText }
      ],
      series: [
        { name: '营业总收入', type: 'bar', data: rev, barWidth: '38%', itemStyle: { borderRadius: [4, 4, 0, 0] } },
        { name: '归母净利润', type: 'line', yAxisIndex: 1, data: np, smooth: true, symbolSize: 8, lineStyle: { width: 3 } }
      ]
    });
  }

  function margins(dom, annual) {
    var years = annual.map(function (a) { return a.year; });
    function series(name, field, color) {
      return {
        name: name, type: 'line', smooth: true, symbolSize: 7,
        data: annual.map(function (a) { return a[field]; }),
        lineStyle: { width: 2.5 }, itemStyle: { color: color }
      };
    }
    return make(dom, {
      color: ['#4f7cff', '#34c38f', '#f5a623'],
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return v == null ? '—' : v.toFixed(2) + '%'; } },
      legend: { data: ['销售毛利率', '销售净利率', '加权ROE'], top: 6, textStyle: baseText },
      grid: baseGrid,
      xAxis: { type: 'category', data: years, axisLine: axisLine, axisLabel: baseText },
      yAxis: { type: 'value', name: '%', axisLine: axisLine, splitLine: splitLine, axisLabel: baseText },
      series: [
        series('销售毛利率', 'grossMargin', '#4f7cff'),
        series('销售净利率', 'netMargin', '#34c38f'),
        series('加权ROE', 'roe', '#f5a623')
      ]
    });
  }

  function expenses(dom, annual) {
    var years = annual.map(function (a) { return a.year; });
    function col(field) {
      return annual.map(function (a) { return fmt.yi(a[field]); });
    }
    return make(dom, {
      color: ['#4f7cff', '#34c38f', '#f5a623', '#e15b6b'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: function (v) { return v == null ? '—' : v + ' 亿'; } },
      legend: { data: ['销售费用', '管理费用', '财务费用', '税金及附加'], top: 6, textStyle: baseText },
      grid: baseGrid,
      xAxis: { type: 'category', data: years, axisLine: axisLine, axisLabel: baseText },
      yAxis: { type: 'value', name: '亿元', axisLine: axisLine, splitLine: splitLine, axisLabel: baseText },
      series: [
        { name: '销售费用', type: 'bar', stack: 'cost', data: col('saleExpense') },
        { name: '管理费用', type: 'bar', stack: 'cost', data: col('manageExpense') },
        { name: '财务费用', type: 'bar', stack: 'cost', data: col('financeExpense') },
        { name: '税金及附加', type: 'bar', stack: 'cost', data: col('operateTaxAdd') }
      ]
    });
  }

  // 净利润变动归因 瀑布图
  function attribution(dom, attr) {
    if (!attr) return null;
    var placeholder = [], positive = [], negative = [];
    var cats = ['上年净利润'];
    placeholder.push(0);
    positive.push(attr.prevNP >= 0 ? attr.prevNP : 0);
    negative.push(attr.prevNP < 0 ? attr.prevNP : 0);

    var cum = attr.prevNP;
    attr.items.forEach(function (it) {
      cats.push(it.label);
      var start = Math.min(cum, cum + (it.value || 0));
      placeholder.push(start);
      if ((it.value || 0) >= 0) { positive.push(it.value || 0); negative.push(0); }
      else { positive.push(0); negative.push(it.value || 0); }
      cum += (it.value || 0);
    });

    cats.push('本年净利润');
    placeholder.push(0);
    positive.push(attr.currNP >= 0 ? attr.currNP : 0);
    negative.push(attr.currNP < 0 ? attr.currNP : 0);

    return make(dom, {
      color: ['#8c93a8', '#34c38f', '#e15b6b'],
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: function (ps) {
          var p = ps[0];
          var idx = p.dataIndex;
          if (idx === 0) return '上年净利润：' + fmt.yuan(attr.prevNP);
          if (idx === cats.length - 1) return '本年净利润：' + fmt.yuan(attr.currNP);
          var it = attr.items[idx - 1];
          return it.label + '<br/>影响额：' + fmt.yuan(it.value) +
            (it.pp == null ? '' : '<br/>贡献：' + fmt.signedPct(it.pp));
        }
      },
      grid: { left: 56, right: 24, top: 30, bottom: 70, containLabel: true },
      xAxis: { type: 'category', data: cats, axisLine: axisLine, axisLabel: Object.assign({ interval: 0, rotate: 28, fontSize: 11 }, baseText) },
      yAxis: { type: 'value', name: '亿元', axisLine: axisLine, splitLine: splitLine, axisLabel: baseText },
      series: [
        { name: '占位', type: 'bar', stack: 'wf', data: placeholder, itemStyle: { color: 'transparent' }, tooltip: { show: false }, barWidth: '46%' },
        { name: '正向', type: 'bar', stack: 'wf', data: positive, itemStyle: { color: '#34c38f', borderRadius: [3, 3, 0, 0] } },
        { name: '负向', type: 'bar', stack: 'wf', data: negative, itemStyle: { color: '#e15b6b', borderRadius: [0, 0, 3, 3] } }
      ]
    });
  }

  function cashflowChart(dom, cfAnnual) {
    var years = cfAnnual.map(function (a) { return a.year; });
    function col(field) { return cfAnnual.map(function (a) { return fmt.yi(a[field]); }); }
    return make(dom, {
      color: ['#34c38f', '#4f7cff', '#f5a623'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: function (v) { return v == null ? '—' : v + ' 亿'; } },
      legend: { data: ['经营现金流净额', '投资现金流净额', '筹资现金流净额'], top: 6, textStyle: baseText },
      grid: baseGrid,
      xAxis: { type: 'category', data: years, axisLine: axisLine, axisLabel: baseText },
      yAxis: { type: 'value', name: '亿元', axisLine: axisLine, splitLine: splitLine, axisLabel: baseText },
      series: [
        { name: '经营现金流净额', type: 'bar', data: col('netcashOperate') },
        { name: '投资现金流净额', type: 'bar', data: col('netcashInvest') },
        { name: '筹资现金流净额', type: 'bar', data: col('netcashFinance') }
      ]
    });
  }

  function disposeAll() {
    instances.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    instances.length = 0;
  }
  function resize() { instances.forEach(function (c) { try { c.resize(); } catch (e) {} }); }

  window.addEventListener('resize', resize);

  return {
    revenueProfit: revenueProfit,
    margins: margins,
    expenses: expenses,
    attribution: attribution,
    cashflowChart: cashflowChart,
    disposeAll: disposeAll,
    resize: resize,
    available: available
  };
})();
