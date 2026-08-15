/**
 * 数据规整 + 净利润变动归因 + 叙事生成 + 事件关联。
 *
 * 归因核心：把 ΔNP(归母净利润) 拆为 营收增长/毛利率变动/三费/税金及附加/所得税/其他(残差)，
 * 强制对账 ΣC_i ≡ ΔNP。金融业走简版（无毛利率/营业成本拆分）。
 */
window.FA = window.FA || {};

FA.fmt = (function () {
  function num(x) {
    if (x === null || x === undefined || x === '') return null;
    var n = Number(x);
    return isNaN(n) ? null : n;
  }
  function fixed(x, d) {
    d = d == null ? 2 : d;
    var n = num(x);
    return n == null ? '—' : n.toFixed(d);
  }
  function yi(x) { // 转亿元
    var n = num(x);
    return n == null ? null : n / 1e8;
  }
  function yuan(x) {
    var n = num(x);
    return n == null ? '—' : (n / 1e8).toFixed(2) + '亿';
  }
  function pct(x, d) {
    d = d == null ? 2 : d;
    var n = num(x);
    return n == null ? '—' : n.toFixed(d) + '%';
  }
  function signedPct(x, d) {
    d = d == null ? 2 : d;
    var n = num(x);
    return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
  }
  return { num: num, fixed: fixed, yi: yi, yuan: yuan, pct: pct, signedPct: signedPct };
})();

FA.analysis = (function () {
  var fmt = FA.fmt;

  // 通用：取年报行（reportDate 以 12-31 结尾），按日期升序
  function annualRows(rows, dateField) {
    return (rows || []).filter(function (r) {
      var d = r[dateField] || '';
      return d.slice(5, 10) === '12-31';
    }).sort(function (a, b) {
      return a[dateField] < b[dateField] ? -1 : (a[dateField] > b[dateField] ? 1 : 0);
    });
  }

  // 最近 N 年年报（升序）
  function lastNAnnual(rows, dateField, n) {
    var arr = annualRows(rows, dateField);
    return arr.slice(Math.max(0, arr.length - n));
  }

  // 季度：最近 N 个报告期（降序取前 N 再反转为升序）
  function lastNPeriods(rows, dateField, n) {
    var arr = (rows || []).slice().sort(function (a, b) {
      return a[dateField] < b[dateField] ? 1 : (a[dateField] > b[dateField] ? -1 : 0);
    });
    return arr.slice(0, n).sort(function (a, b) {
      return a[dateField] < b[dateField] ? -1 : (a[dateField] > b[dateField] ? 1 : 0);
    });
  }

  // 主要指标 → 年报序列
  function indicatorAnnual(indRows) {
    return lastNAnnual(indRows, 'REPORTDATE', 6).map(function (r) {
      var revenue = fmt.num(r.TOTAL_OPERATE_INCOME);
      var np = fmt.num(r.PARENT_NETPROFIT);
      return {
        year: r.REPORTDATE.slice(0, 4),
        reportDate: r.REPORTDATE,
        revenue: revenue,
        netProfit: np,
        yoyRev: fmt.num(r.YSTZ),
        yoyNP: fmt.num(r.SJLTZ),
        qoqRev: fmt.num(r.YSHZ),
        qoqNP: fmt.num(r.SJLHZ),
        grossMargin: fmt.num(r.XSMLL),
        netMargin: revenue && np != null ? np / revenue * 100 : null,
        roe: fmt.num(r.WEIGHTAVG_ROE),
        eps: fmt.num(r.BASIC_EPS),
        bps: fmt.num(r.BPS),
        ocfPerShare: fmt.num(r.MGJYXJJE),
        assign: r.ASSIGNDSCRPT,
        noticeDate: r.NOTICE_DATE
      };
    });
  }

  // 利润表 → 年报序列
  function incomeAnnual(incRows) {
    return lastNAnnual(incRows, 'REPORT_DATE', 6).map(function (r) {
      return {
        year: r.REPORT_DATE.slice(0, 4),
        reportDate: r.REPORT_DATE,
        revenue: fmt.num(r.TOTAL_OPERATE_INCOME),
        totalCost: fmt.num(r.TOTAL_OPERATE_COST),
        operateCost: fmt.num(r.OPERATE_COST),
        saleExpense: fmt.num(r.SALE_EXPENSE),
        manageExpense: fmt.num(r.MANAGE_EXPENSE),
        manageExpenseBank: fmt.num(r.MANAGE_EXPENSE_BANK),
        financeExpense: fmt.num(r.FINANCE_EXPENSE),
        operateTaxAdd: fmt.num(r.OPERATE_TAX_ADD),
        operateProfit: fmt.num(r.OPERATE_PROFIT),
        totalProfit: fmt.num(r.TOTAL_PROFIT),
        incomeTax: fmt.num(r.INCOME_TAX),
        netProfit: fmt.num(r.PARENT_NETPROFIT),
        deductNP: fmt.num(r.DEDUCT_PARENT_NETPROFIT),
        interestNI: fmt.num(r.INTEREST_NI),
        feeCommissionNI: fmt.num(r.FEE_COMMISSION_NI),
        ratios: {
          toi: fmt.num(r.TOI_RATIO),
          np: fmt.num(r.PARENT_NETPROFIT_RATIO),
          op: fmt.num(r.OPERATE_PROFIT_RATIO),
          toe: fmt.num(r.TOE_RATIO),
          dpn: fmt.num(r.DPN_RATIO)
        }
      };
    });
  }

  // 资产负债表 → 年报序列
  function balanceAnnual(balRows) {
    return lastNAnnual(balRows, 'REPORT_DATE', 6).map(function (r) {
      return {
        year: r.REPORT_DATE.slice(0, 4),
        reportDate: r.REPORT_DATE,
        totalAssets: fmt.num(r.TOTAL_ASSETS),
        monetaryFunds: fmt.num(r.MONETARYFUNDS),
        accountsRece: fmt.num(r.ACCOUNTS_RECE),
        inventory: fmt.num(r.INVENTORY),
        totalLiabilities: fmt.num(r.TOTAL_LIABILITIES),
        accountsPayable: fmt.num(r.ACCOUNTS_PAYABLE),
        totalEquity: fmt.num(r.TOTAL_EQUITY),
        currentRatio: fmt.num(r.CURRENT_RATIO),
        debtAssetRatio: fmt.num(r.DEBT_ASSET_RATIO)
      };
    });
  }

  // 现金流量表 → 年报序列
  function cashflowAnnual(cfRows) {
    return lastNAnnual(cfRows, 'REPORT_DATE', 6).map(function (r) {
      return {
        year: r.REPORT_DATE.slice(0, 4),
        reportDate: r.REPORT_DATE,
        netcashOperate: fmt.num(r.NETCASH_OPERATE),
        salesServices: fmt.num(r.SALES_SERVICES),
        payStaffCash: fmt.num(r.PAY_STAFF_CASH),
        netcashInvest: fmt.num(r.NETCASH_INVEST),
        netcashFinance: fmt.num(r.NETCASH_FINANCE),
        cceAdd: fmt.num(r.CCE_ADD)
      };
    });
  }

  function isFinancial(industry) {
    if (!industry) return false;
    return /银行|保险|证券|多元金融|金融/.test(industry);
  }

  function delta(c, p) {
    var cv = fmt.num(c), pv = fmt.num(p);
    return (cv == null ? 0 : cv) - (pv == null ? 0 : pv);
  }

  /**
   * 净利润变动归因。
   * @param {object} curr  本期 incomeAnnual 行
   * @param {object} prev  上期 incomeAnnual 行
   * @param {string} industry 行业
   * @returns 归因结果 { items, dNP, prevNP, currNP, financial, mode, cogsUsed }
   */
  function attributeProfit(curr, prev, industry) {
    if (!curr || !prev) return null;
    var financial = isFinancial(industry);
    var N0 = fmt.num(prev.netProfit) || 0;
    var N1 = fmt.num(curr.netProfit) || 0;
    var dNP = N1 - N0;
    var items = [];

    if (financial) {
      items.push({ key: 'rev', label: '营收变动', value: delta(curr.revenue, prev.revenue) });
      var mc = curr.manageExpenseBank != null ? curr.manageExpenseBank : curr.manageExpense;
      var mp = prev.manageExpenseBank != null ? prev.manageExpenseBank : prev.manageExpense;
      items.push({ key: 'mgmt', label: '业务及管理费变动', value: -delta(mc, mp) });
      items.push({ key: 'tax', label: '税金及附加变动', value: -delta(curr.operateTaxAdd, prev.operateTaxAdd) });
      items.push({ key: 'inctax', label: '所得税变动', value: -delta(curr.incomeTax, prev.incomeTax) });
    } else {
      var Rev1 = fmt.num(curr.revenue), Rev0 = fmt.num(prev.revenue);
      var COGS1 = fmt.num(curr.operateCost), COGS0 = fmt.num(prev.operateCost);
      var mode = 'gross';
      var cRev = 0, cGM = 0, cogsUsed = false;

      if (Rev1 == null || Rev0 == null || !Rev0 || COGS1 == null || COGS0 == null) {
        mode = 'simple';
        cRev = delta(curr.revenue, prev.revenue);
      } else {
        var GM0 = (Rev0 - COGS0) / Rev0;
        var GM1 = (Rev1 - COGS1) / Rev1;
        if (!isFinite(GM0) || !isFinite(GM1) || GM0 < -0.5 || GM0 > 1 || GM1 < -0.5 || GM1 > 1) {
          mode = 'simple';
          cRev = delta(curr.revenue, prev.revenue);
        } else {
          cogsUsed = true;
          cRev = (Rev1 - Rev0) * GM0;          // 营收增长贡献（旧毛利率）
          cGM = (GM1 - GM0) * Rev1;            // 毛利率变动贡献（含营业成本变动）
        }
      }
      items.push({ key: 'rev', label: '营收增长', value: cRev });
      if (mode === 'gross') items.push({ key: 'gm', label: '毛利率变动', value: cGM });
      items.push({ key: 'sale', label: '销售费用变动', value: -delta(curr.saleExpense, prev.saleExpense) });
      items.push({ key: 'mgmt', label: '管理费用变动', value: -delta(curr.manageExpense, prev.manageExpense) });
      items.push({ key: 'fin', label: '财务费用变动', value: -delta(curr.financeExpense, prev.financeExpense) });
      items.push({ key: 'tax', label: '税金及附加变动', value: -delta(curr.operateTaxAdd, prev.operateTaxAdd) });
      items.push({ key: 'inctax', label: '所得税变动', value: -delta(curr.incomeTax, prev.incomeTax) });
    }

    var sumMain = items.reduce(function (s, it) { return s + (it.value || 0); }, 0);
    var residual = dNP - sumMain;
    items.push({ key: 'other', label: '其他(营业外/投资/减值/研发等)', value: residual, residual: true });

    items.forEach(function (it) {
      it.pp = N0 ? (it.value / N0 * 100) : null;
    });

    return {
      curr: curr, prev: prev,
      dNP: dNP, prevNP: N0, currNP: N1,
      items: items, financial: financial,
      mode: financial ? 'financial' : (items.some(function (i) { return i.key === 'gm'; }) ? 'gross' : 'simple'),
      cogsUsed: !financial && items.some(function (i) { return i.key === 'gm'; })
    };
  }

  // 用接口自带 *_RATIO 交叉校验本期计算同比
  function validateRatios(curr, prev) {
    var checks = [];
    if (!curr || !prev) return checks;
    var calc = function (a, b) { return b ? (a / b - 1) * 100 : null; };
    function cmp(label, calcV, ratioV) {
      if (calcV == null || ratioV == null) return;
      checks.push({ label: label, calc: calcV, ratio: ratioV, diff: Math.abs(calcV - ratioV) });
    }
    cmp('营收同比', calc(fmt.num(curr.revenue), fmt.num(prev.revenue)), curr.ratios && curr.ratios.toi);
    cmp('净利润同比', calc(fmt.num(curr.netProfit), fmt.num(prev.netProfit)), curr.ratios && curr.ratios.np);
    cmp('营业利润同比', calc(fmt.num(curr.operateProfit), fmt.num(prev.operateProfit)), curr.ratios && curr.ratios.op);
    cmp('总成本同比', calc(fmt.num(curr.totalCost), fmt.num(prev.totalCost)), curr.ratios && curr.ratios.toe);
    cmp('扣非净利润同比', calc(fmt.num(curr.deductNP), fmt.num(prev.deductNP)), curr.ratios && curr.ratios.dpn);
    return checks;
  }

  // 中文叙事
  function narrative(company, attr) {
    if (!attr) return '数据不足，无法生成归因分析。';
    var curr = attr.curr;
    var yoyNP = curr.ratios && curr.ratios.np;
    var yoyRev = curr.ratios && curr.ratios.toi;
    var s = curr.year + '年，' + company.name + '（' + company.code + '.' + (company.exchange || '') + '）' +
      '实现营业总收入 ' + fmt.yuan(curr.revenue) + '，同比 ' + fmt.signedPct(yoyRev) +
      '；归母净利润 ' + fmt.yuan(curr.netProfit) + '，同比 ' + fmt.signedPct(yoyNP) + '。';

    var drivers = attr.items.filter(function (it) { return !it.residual; })
      .sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    var pos = drivers.filter(function (it) { return it.value > 0; }).slice(0, 3);
    var neg = drivers.filter(function (it) { return it.value < 0; }).slice(0, 3);

    s += '\n\n净利润同比变动 ' + fmt.signedPct(yoyNP) + '（' + (attr.dNP >= 0 ? '增加' : '减少') +
      ' ' + fmt.yuan(Math.abs(attr.dNP)) + '），主要驱动：';
    if (pos.length) s += '\n· 正向：' + pos.map(function (it) {
      return it.label + ' ' + fmt.signedPct(it.pp) + '（' + fmt.yuan(it.value) + '）';
    }).join('；') + '；';
    if (neg.length) s += '\n· 拖累：' + neg.map(function (it) {
      return it.label + ' ' + fmt.signedPct(it.pp) + '（' + fmt.yuan(it.value) + '）';
    }).join('；') + '。';

    var res = attr.items.find(function (it) { return it.residual; });
    if (res && attr.dNP !== 0 && Math.abs(res.value) > Math.abs(attr.dNP) * 0.3) {
      s += '\n\n注：其他项目（营业外收支/投资收益/减值/研发等）净影响 ' +
        fmt.signedPct(res.pp) + '（' + fmt.yuan(res.value) + '），占比偏大，归因解释力有限，建议结合年报附注与公告阅读。';
    }
    if (attr.financial) {
      s += '\n\n（金融业采用简版归因，未拆分毛利率与营业成本；银行营收结构可参考利息净收入/手续费净收入变动。）';
    }
    if (attr.prevNP < 0) {
      s += '\n\n提示：上年同期为亏损状态，百分比贡献仅供参考，请以绝对额为准。';
    }
    return s;
  }

  // 事件高亮类别分级（数字越小越重要）
  var CATEGORY_RANK = {
    '业绩预告': 1, '业绩快报': 1, '业绩预增': 1, '业绩预减': 1, '业绩预亏': 1, '业绩大幅下降': 1,
    '分配方案实施': 2, '分配方案决议公告': 2, '分配方案调整': 2, '利润分配': 2,
    '重大事项': 3,
    '高管人员任职变动': 4, '高管变动': 4,
    '股东大会决议公告': 5, '董事会决议公告': 5, '股东大会资料': 5
  };
  function categoryRank(name) {
    if (!name) return 9;
    if (CATEGORY_RANK[name] != null) return CATEGORY_RANK[name];
    if (/业绩|预增|预减|预亏/.test(name)) return 1;
    if (/分配|分红|派息/.test(name)) return 2;
    if (/重大事项/.test(name)) return 3;
    if (/高管|任职|辞职/.test(name)) return 4;
    if (/股东大会|董事会/.test(name)) return 5;
    return 9;
  }

  // 取某报告期前后窗口内的公告
  // stockCode 用于拼接东方财富公告详情页 URL
  function eventsByPeriod(annList, reportDate, days, stockCode) {
    days = days || 120;
    var t = new Date(reportDate.replace(/-/g, '/')).getTime();
    if (isNaN(t)) return [];
    var pre = t - days * 86400000, post = t + days * 86400000;
    return (annList || []).filter(function (a) {
      var ds = (a.notice_date || '').slice(0, 10);
      var d = new Date(ds.replace(/-/g, '/')).getTime();
      if (isNaN(d)) return false;
      return d >= pre && d <= post;
    }).map(function (a) {
      var cat = (a.columns && a.columns[0] && a.columns[0].column_name) || '其他';
      var artCode = a.art_code;
      return {
        date: (a.notice_date || '').slice(0, 10),
        title: a.title_ch || a.title || '',
        category: cat,
        rank: categoryRank(cat),
        artCode: artCode,
        url: artCode && stockCode
          ? 'https://data.eastmoney.com/notices/detail/' + stockCode + '/' + artCode + '.html'
          : null
      };
    }).sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }

  // ---- 港股数据解析 ----
  // 港股主要指标 → 年报序列（字段名与 A 股不同，需映射）
  function hkIndicatorAnnual(indRows) {
    return lastNAnnual(indRows, 'REPORT_DATE', 6).map(function (r) {
      var revenue = fmt.num(r.OPERATE_INCOME);
      var np = fmt.num(r.HOLDER_PROFIT);
      return {
        year: r.REPORT_DATE.slice(0, 4),
        reportDate: r.REPORT_DATE,
        revenue: revenue,
        netProfit: np,
        yoyRev: fmt.num(r.OPERATE_INCOME_YOY),
        yoyNP: fmt.num(r.HOLDER_PROFIT_YOY),
        grossMargin: fmt.num(r.GROSS_PROFIT_RATIO),
        netMargin: revenue && np != null ? np / revenue * 100 : null,
        roe: fmt.num(r.ROE_AVG),
        eps: fmt.num(r.BASIC_EPS),
        bps: fmt.num(r.BPS),
        ocfPerShare: fmt.num(r.PER_NETCASH_OPERATE),
        assign: null
      };
    });
  }

  // 港股利润表科目代码 → 内部字段名
  var HK_INCOME_MAP = {
    '004001999': 'revenue',        // 营运收入
    '004005001': 'operateCost',    // 营运支出
    '004010003': 'saleExpense',    // 销售及分销费用
    '004010004': 'manageExpense',  // 行政开支
    '004010999': 'operateProfit',  // 经营溢利
    '004011201': 'financeExpense', // 融资成本
    '004011999': 'totalProfit',    // 除税前溢利
    '004012001': 'incomeTax',      // 税项
    '004025002': 'netProfit'       // 股东应占溢利
  };

  // 港股利润表透视数据 → 宽表年报序列
  function hkIncomeAnnual(rawRows, indRows) {
    var byDate = {};
    (rawRows || []).forEach(function (r) {
      var date = (r.REPORT_DATE || '').slice(0, 10);
      if (!byDate[date]) byDate[date] = { reportDate: date };
      var field = HK_INCOME_MAP[r.STD_ITEM_CODE];
      if (field) byDate[date][field] = fmt.num(r.AMOUNT);
    });
    // 合并主指标的同比比率（用于交叉校验）
    var ratioMap = {};
    (indRows || []).forEach(function (r) {
      var d = (r.REPORT_DATE || '').slice(0, 10);
      ratioMap[d] = {
        toi: fmt.num(r.OPERATE_INCOME_YOY),
        np: fmt.num(r.HOLDER_PROFIT_YOY)
      };
    });
    var arr = Object.keys(byDate).map(function (k) { return byDate[k]; })
      .filter(function (r) { return r.reportDate.slice(5, 10) === '12-31'; })
      .sort(function (a, b) { return a.reportDate < b.reportDate ? -1 : 1; });
    return arr.slice(Math.max(0, arr.length - 6)).map(function (r) {
      r.year = r.reportDate.slice(0, 4);
      r.totalCost = (r.revenue != null && r.operateProfit != null) ? r.revenue - r.operateProfit : null;
      r.operateTaxAdd = 0; // 港股报表无税金及附加行
      r.deductNP = null;
      r.ratios = ratioMap[r.reportDate] || {};
      return r;
    });
  }

  // 港股资产负债表科目代码 → 内部字段名（港股 code 为 9 位 004xxxxxx）
  // 注：代码取自 RPT_HKF10_FN_BALANCE_PC 实际返回的 STD_ITEM_CODE
  var HK_BALANCE_MAP = {
    '004009999': 'totalAssets',      // 总资产
    '004002010': 'monetaryFunds',    // 现金及等价物
    '004002003': 'accountsRece',     // 应收帐款
    '004002001': 'inventory',        // 存货
    '004025999': 'totalLiabilities', // 总负债
    '004011001': 'accountsPayable',  // 应付帐款
    '004036999': 'totalEquity',      // 总权益
    '004002999': 'currentAssets',    // 流动资产合计（用于衍生流动比率）
    '004011999': 'currentLiabilities'// 流动负债合计（用于衍生流动比率）
  };
  // 港股现金流量表科目代码 → 内部字段名（港股 code 为 6 位 0xxxxx）
  var HK_CASHFLOW_MAP = {
    '003999': 'netcashOperate',  // 经营业务现金净额
    '005999': 'netcashInvest',   // 投资业务现金流量净额
    '007999': 'netcashFinance',  // 融资业务现金流量净额
    '010999': 'cceAdd'           // 现金净额（现金及等价物净增加额）
  };

  function hkPivotAnnual(rawRows, map, dateField) {
    var byDate = {};
    (rawRows || []).forEach(function (r) {
      var date = (r[dateField || 'REPORT_DATE'] || '').slice(0, 10);
      if (!byDate[date]) byDate[date] = { reportDate: date };
      var field = map[r.STD_ITEM_CODE];
      if (field) byDate[date][field] = fmt.num(r.AMOUNT);
    });
    var arr = Object.keys(byDate).map(function (k) { return byDate[k]; })
      .filter(function (r) { return r.reportDate.slice(5, 10) === '12-31'; })
      .sort(function (a, b) { return a.reportDate < b.reportDate ? -1 : 1; });
    return arr.slice(Math.max(0, arr.length - 6)).map(function (r) {
      r.year = r.reportDate.slice(0, 4);
      return r;
    });
  }

  function hkBalanceAnnual(rawRows) {
    var arr = hkPivotAnnual(rawRows, HK_BALANCE_MAP);
    // 衍生指标：流动比率(%) = 流动资产/流动负债*100；资产负债率(%) = 总负债/总资产*100
    arr.forEach(function (r) {
      r.currentRatio = (r.currentAssets != null && r.currentLiabilities)
        ? r.currentAssets / r.currentLiabilities * 100 : null;
      r.debtAssetRatio = (r.totalLiabilities != null && r.totalAssets)
        ? r.totalLiabilities / r.totalAssets * 100 : null;
    });
    return arr;
  }

  function hkCashflowAnnual(rawRows) {
    return hkPivotAnnual(rawRows, HK_CASHFLOW_MAP);
  }

  return {
    annualRows: annualRows,
    lastNAnnual: lastNAnnual,
    lastNPeriods: lastNPeriods,
    indicatorAnnual: indicatorAnnual,
    incomeAnnual: incomeAnnual,
    balanceAnnual: balanceAnnual,
    cashflowAnnual: cashflowAnnual,
    isFinancial: isFinancial,
    attributeProfit: attributeProfit,
    validateRatios: validateRatios,
    narrative: narrative,
    eventsByPeriod: eventsByPeriod,
    categoryRank: categoryRank,
    hkIndicatorAnnual: hkIndicatorAnnual,
    hkIncomeAnnual: hkIncomeAnnual,
    hkBalanceAnnual: hkBalanceAnnual,
    hkCashflowAnnual: hkCashflowAnnual
  };
})();
