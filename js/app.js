/**
 * Handly Stock — 前端 Dashboard
 * 搜索、股票详情（财务/K线/AI分析/回测）、信号选股/涨停板/全市场扫描
 */
(function() {
  'use strict';

  // === DEBUG ===
  function dlog(msg, cls) {
    var bar = document.getElementById('debugBar');
    if (bar) bar.innerHTML += '<span style="color:'+(cls==='ok'?'#22c55e':cls==='err'?'#ef4444':'#f59e0b')+'">['+new Date().toLocaleTimeString()+'] '+msg+'</span><br>';
    console.log('[Handly]', msg);
  }

  const D = window.SIGNALS_DATA || {};
  dlog('app.js 初始化, D.total_stocks='+(D.total_stocks||'?'));

  // ==================== 工具函数 ====================
  function fmtAmt(val) {
    if (!val && val !== 0) return '-';
    const n = +val;
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(0) + '万';
    return n.toFixed(0);
  }

  function fmtPct(val) {
    if (val === undefined || val === null) return '-';
    const n = +val;
    if (isNaN(n)) return '-';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function changeClass(val) {
    return val >= 0 ? 'change-up' : 'change-down';
  }

  function actionClass(action) {
    if (action === 'strong_buy') return 'strong';
    if (action === 'buy') return 'buy';
    return 'watch';
  }

  function actionLabel(action) {
    if (action === 'strong_buy') return '强烈推荐';
    if (action === 'buy') return '推荐买入';
    if (action === 'watch') return '观察';
    return '-';
  }

  function fmtTime(ts) {
    return ts || '--';
  }

  // ==================== 搜索索引构建 ====================
  function buildSearchIndex() {
    var map = {};
    // 从 stock_index 读取（如果有）
    if (D.stock_index && D.stock_index.length) {
      D.stock_index.forEach(function(s) {
        map[s.code] = { code: s.code, name: s.name, price: s.price, change_pct: s.change_pct };
      });
    }
    // 补充从各信号列表收集
    var lists = ['strong_buy', 'buy', 'watch', 'top_signals', 'limit_up_list'];
    lists.forEach(function(key) {
      var arr = D[key] || [];
      arr.forEach(function(s) {
        if (!map[s.code]) {
          map[s.code] = { code: s.code, name: s.name, price: s.price, change_pct: s.change_pct };
        }
      });
    });
    var result = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) result.push(map[k]);
    }
    return result;
  }

  var searchIndex = null;

  // ==================== 搜索框逻辑 ====================
  function initSearch() {
    searchIndex = buildSearchIndex();
    var input = document.getElementById('searchInput');
    var dropdown = document.getElementById('searchDropdown');

    input.addEventListener('input', function() {
      var q = input.value.trim().toLowerCase();
      if (!q) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }
      var matches = searchIndex.filter(function(s) {
        return s.code.indexOf(q) !== -1 || s.name.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 15);

      if (matches.length === 0) {
        dropdown.innerHTML = '<div class="search-no-result">未找到匹配的股票</div>';
      } else {
        dropdown.innerHTML = matches.map(function(s) {
          var changeStr = '';
          var changeCls = '';
          if (s.change_pct !== undefined && s.change_pct !== null) {
            var pct = +s.change_pct;
            changeStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
            changeCls = pct >= 0 ? 'change-up' : 'change-down';
          }
          return '<div class="search-item" data-code="' + s.code + '" data-name="' + s.name + '">' +
            '<span class="search-item-code">' + s.code + '</span>' +
            '<span class="search-item-name">' + s.name + '</span>' +
            '<span class="search-item-price">' + (s.price ? s.price.toFixed(2) : '-') + '</span>' +
            (changeStr ? '<span class="' + changeCls + '" style="font-size:0.78rem;margin-left:8px">' + changeStr + '</span>' : '') +
          '</div>';
        }).join('');
      }
      dropdown.classList.add('active');
    });

    // 点击下拉项打开详情
    dropdown.addEventListener('click', function(e) {
      var item = e.target.closest('.search-item');
      if (!item) return;
      var code = item.getAttribute('data-code');
      var name = item.getAttribute('data-name');
      openDetail(code, name);
      dropdown.classList.remove('active');
      input.value = '';
    });

    // 点击其他地方关闭下拉
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.search-wrap')) {
        dropdown.classList.remove('active');
      }
    });

    // 回车打开第一个结果
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var first = dropdown.querySelector('.search-item');
        if (first) {
          var code = first.getAttribute('data-code');
          var name = first.getAttribute('data-name');
          openDetail(code, name);
          dropdown.classList.remove('active');
          input.value = '';
        }
      }
    });
  }

  // ==================== 股票详情 ====================
  var currentDetailCode = null;
  var klineChart = null;
  var volumeChart = null;
  var btEquityChart = null;
  var detailCache = {};   // 按需加载的 detail 缓存
  var detailLoading = false;

  function getDetailData(callback) {
    var code = currentDetailCode;
    if (!code) { callback({}); return; }

    // 从缓存返回
    if (detailCache[code]) {
      callback(detailCache[code]);
      return;
    }

    // 检查旧版 bundled 数据（兼容）
    if (D.details && D.details[code]) {
      detailCache[code] = D.details[code];
      callback(detailCache[code]);
      return;
    }

    // 按需加载
    if (detailLoading) { callback({}); return; }
    detailLoading = true;
    showDetailLoading();

    dlog('getDetailData fetch: details/'+code+'.json', 'info');
    fetch('details/' + code + '.json')
      .then(function(r) {
        if (r.ok) return r.json();
        throw new Error('Not found');
      })
      .then(function(data) {
        dlog('getDetailData OK: kline='+(data.kline?data.kline.length:0), 'ok');
        detailCache[code] = data;
        detailLoading = false;
        hideDetailLoading();
        callback(data);
      })
      .catch(function(err) {
        dlog('getDetailData FAIL: '+(err&&err.message||'network'), 'err');
        detailLoading = false;
        var ov = document.getElementById('detailLoadingOverlay');
        if (ov) ov.innerHTML = '<div style="color:#ef4444;font-size:0.85rem;text-align:center">加载失败: ' + (err && err.message || '网络错误') + '<br><small>请检查网络或刷新重试</small></div>';
        callback({});
      });
  }

  function showDetailLoading() {
    dlog('showDetailLoading');
    // 用 overlay 覆盖，不破坏 panel 内部 DOM（render 函数需要子元素引用）
    var body = document.querySelector('#detailModal .modal-body');
    var ov = document.getElementById('detailLoadingOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'detailLoadingOverlay';
      ov.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:rgba(18,20,30,0.92);z-index:20;border-radius:0 0 8px 8px;';
      ov.innerHTML = '<div style="color:#787b86;font-size:0.9rem;">加载中...</div>';
      body.style.position = 'relative';
      body.appendChild(ov);
    }
    ov.style.display = 'flex';
  }

  function hideDetailLoading() {
    dlog('hideDetailLoading');
    var ov = document.getElementById('detailLoadingOverlay');
    if (ov) ov.style.display = 'none';
    // 渲染当前 tab
    var activeTab = document.querySelector('#detailTabs .modal-tab.active');
    if (activeTab) switchDetailTab(activeTab.getAttribute('data-dtab'));
  }

  function openDetail(code, name) {
    dlog('openDetail: '+code+' '+name, 'info');
    currentDetailCode = code;
    var overlay = document.getElementById('detailOverlay');

    // Header
    var priceStr = '-';
    var changeStr = '';
    var changeCls = '';
    if (searchIndex) {
      var idxEntry = null;
      for (var i = 0; i < searchIndex.length; i++) {
        if (searchIndex[i].code === code) { idxEntry = searchIndex[i]; break; }
      }
      if (idxEntry && idxEntry.price) {
        priceStr = idxEntry.price.toFixed(2);
        if (idxEntry.change_pct !== undefined && idxEntry.change_pct !== null) {
          var pct = +idxEntry.change_pct;
          changeStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
          changeCls = pct >= 0 ? 'change-up' : 'change-down';
        }
      }
    }

    document.getElementById('detailCode').textContent = code;
    document.getElementById('detailName').textContent = name || code;
    document.getElementById('detailPrice').textContent = priceStr;
    var changeEl = document.getElementById('detailChange');
    changeEl.textContent = changeStr;
    changeEl.className = 'modal-stock-change ' + changeCls;

    overlay.classList.add('active');

    // 显示加载状态 + 切换到第一个 tab
    showDetailLoading();
    document.querySelectorAll('#detailTabs .modal-tab').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.detail-panel').forEach(function(p) { p.classList.remove('active'); });
    var firstTab = document.querySelector('#detailTabs .modal-tab');
    if (firstTab) {
      firstTab.classList.add('active');
      document.getElementById('panel-' + firstTab.getAttribute('data-dtab')).classList.add('active');
    }

    // 异步加载 detail 数据
    getDetailData(function(data) {
      if (data && Object.keys(data).length > 0) {
        // 重新渲染当前 tab
        var activeTab = document.querySelector('#detailTabs .modal-tab.active');
        if (activeTab) switchDetailTab(activeTab.getAttribute('data-dtab'));
      }
    });
  }

  function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('active');
    // 释放图表
    if (klineChart) { klineChart.dispose(); klineChart = null; }
    if (volumeChart) { volumeChart.dispose(); volumeChart = null; }
    if (btEquityChart) { btEquityChart.dispose(); btEquityChart = null; }
    currentDetailCode = null;
  }

  function switchDetailTab(tabName) {
    dlog('switchDetailTab: '+tabName);
    document.querySelectorAll('#detailTabs .modal-tab').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.detail-panel').forEach(function(p) { p.classList.remove('active'); });
    var tabBtn = document.querySelector('#detailTabs .modal-tab[data-dtab="' + tabName + '"]');
    if (tabBtn) tabBtn.classList.add('active');
    var panel = document.getElementById('panel-' + tabName);
    if (panel) panel.classList.add('active');

    // 释放图表
    if (tabName !== 'kline' && klineChart) { klineChart.dispose(); klineChart = null; }
    if (tabName !== 'kline' && volumeChart) { volumeChart.dispose(); volumeChart = null; }

    // 异步加载数据后渲染
    getDetailData(function(data) {
      if (tabName === 'finance') renderFinanceTab();
      else if (tabName === 'kline') renderKlineTab();
      else if (tabName === 'ai') renderAITab();
      else if (tabName === 'backtest') renderBacktestTab();
    });
  }

  function getCacheDetail() {
    var code = currentDetailCode;
    if (!code) return {};
    if (detailCache[code]) return detailCache[code];
    return (D.details && D.details[code]) || {};
  }

  // === 财务 Tab ===
  function renderFinanceTab() {
    dlog('renderFinanceTab');
    var grid = document.getElementById('financeGrid');
    if (!grid) return;
    var detail = getCacheDetail();
    var fin = (detail.financials && detail.financials.summary) || {};
    var signal = detail.signal || {};

    var items = [
      { label: 'PE（市盈率）', key: 'pe', source: 'signal' },
      { label: 'PB（市净率）', key: 'pb', source: 'signal' },
      { label: 'ROE', key: 'roe', source: 'fin' },
      { label: '净利润', key: 'net_profit', source: 'fin' },
      { label: '营收', key: 'revenue', source: 'fin' },
      { label: '资产负债率', key: 'debt_ratio', source: 'fin' },
      { label: '每股收益', key: 'eps', source: 'fin' },
      { label: '净利率', key: 'net_margin', source: 'fin' }
    ];

    if ((!fin || Object.keys(fin).length === 0) && (!signal || Object.keys(signal).length === 0)) {
      grid.innerHTML = '<div class="no-data">暂无财务数据</div>';
      return;
    }

    grid.innerHTML = items.map(function(item) {
      var val = item.source === 'signal' ? signal[item.key] : fin[item.key];
      var displayVal = '-';
      if (val !== undefined && val !== null && val !== '') {
        if (item.key === 'net_profit' || item.key === 'revenue') {
          displayVal = val;
        } else if (item.key === 'roe' || item.key === 'debt_ratio' || item.key === 'net_margin') {
          displayVal = (typeof val === 'string' && val.indexOf('%') !== -1) ? val : (+val).toFixed(2) + '%';
        } else {
          displayVal = (+val).toFixed(2);
        }
      }

      return '<div class="fin-card">' +
        '<div class="fin-card-label">' + item.label + '</div>' +
        '<div class="fin-card-value" style="font-size:1.1rem;font-weight:700;color:#d1d4dc">' + displayVal + '</div>' +
      '</div>';
    }).join('');

    // 报告期
    if (fin.report_period) {
      grid.innerHTML += '<div class="no-data" style="grid-column:1/-1;font-size:0.75rem">报告期: ' + fin.report_period + '</div>';
    }
  }

  // === K线图 Tab ===
  function renderKlineTab() {
    dlog('renderKlineTab');
    if (klineChart) { klineChart.dispose(); klineChart = null; }
    if (volumeChart) { volumeChart.dispose(); volumeChart = null; }

    var detail = getCacheDetail();
    var klineData = detail.kline || [];
    if (!klineData || klineData.length === 0) {
      document.getElementById('klineChart').innerHTML = '<div class="no-data">暂无K线数据</div>';
      document.getElementById('volumeChart').innerHTML = '';
      return;
    }
    // 恢复容器
    document.getElementById('klineChart').innerHTML = '';
    var klineDom = document.getElementById('klineChart');
    var volDom = document.getElementById('volumeChart');

    // 取最近120条
    var raw = klineData.slice(-120);

    // 准备 ECharts 数据
    var dates = raw.map(function(d) { return d.date; });
    var ohlc = raw.map(function(d) { return [+d.open, +d.close, +d.low, +d.high]; });
    var volumes = raw.map(function(d) { return +d.volume; });

    // 计算均线
    function calcMA(data, period) {
      var result = [];
      for (var i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        var sum = 0;
        for (var j = 0; j < period; j++) sum += +data[i - j].close;
        result.push(+(sum / period).toFixed(2));
      }
      return result;
    }
    var ma5 = calcMA(raw, 5);
    var ma10 = calcMA(raw, 10);
    var ma20 = calcMA(raw, 20);

    // K线图
    klineChart = echarts.init(klineDom);
    klineChart.setOption({
      backgroundColor: 'transparent',
      title: { text: currentDetailCode + ' 日K线', left: 'center', top: 4, textStyle: { color: '#d1d4dc', fontSize: 13 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['K线', 'MA5', 'MA10', 'MA20'], top: 30, textStyle: { color: '#787b86', fontSize: 11 }, left: 'center' },
      grid: { left: '8%', right: '2%', top: 70, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#2a2d38' } }, axisLabel: { color: '#787b86', fontSize: 10 } },
      yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1a1d27' } }, axisLabel: { color: '#787b86', fontSize: 10 } },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, backgroundColor: '#1a1d27', dataBackground: { lineStyle: { color: '#2a2d38' } }, fillerColor: 'rgba(59,130,246,0.2)', borderColor: '#2a2d38', textStyle: { color: '#787b86' }, bottom: 6, height: 20 }
      ],
      series: [
        { name: 'K线', type: 'candlestick', data: ohlc, itemStyle: { color: '#ef4444', color0: '#22c55e', borderColor: '#ef4444', borderColor0: '#22c55e' } },
        { name: 'MA5', type: 'line', data: ma5, smooth: true, lineStyle: { width: 1.5, color: '#f59e0b' }, symbol: 'none', showSymbol: false },
        { name: 'MA10', type: 'line', data: ma10, smooth: true, lineStyle: { width: 1.5, color: '#a78bfa' }, symbol: 'none', showSymbol: false },
        { name: 'MA20', type: 'line', data: ma20, smooth: true, lineStyle: { width: 1.5, color: '#3b82f6' }, symbol: 'none', showSymbol: false }
      ]
    });

    // 成交量图
    volumeChart = echarts.init(volDom);
    volumeChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: '8%', right: '2%', top: 10, bottom: 20 },
      xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#2a2d38' } }, axisLabel: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1a1d27' } }, axisLabel: { color: '#787b86', fontSize: 10 } },
      series: [{
        name: '成交量', type: 'bar', data: volumes,
        itemStyle: {
          color: function(params) {
            var idx = params.dataIndex;
            if (idx < 1) return '#787b86';
            return +raw[idx].close >= +raw[idx].open ? '#ef4444' : '#22c55e';
          }
        }
      }]
    });

    // 联动缩放
    klineChart.group = 'kl-group';
    volumeChart.group = 'kl-group';
    echarts.connect('kl-group');

    // 响应式
    var resizeHandler = function() {
      if (klineChart && !klineChart.isDisposed()) klineChart.resize();
      if (volumeChart && !volumeChart.isDisposed()) volumeChart.resize();
    };
    window.addEventListener('resize', resizeHandler);
    // 清理旧的handler（简单处理）
    klineChart._resizeHandler = resizeHandler;
  }

  // === AI 分析 Tab ===
  function renderAITab() {
    dlog('renderAITab');
    var container = document.getElementById('aiCards');
    if (!container) return;
    var detail = getCacheDetail();
    var ai = detail.ai_analysis || {};

    if (!ai || Object.keys(ai).length === 0) {
      container.innerHTML = '<div class="no-data">暂无AI分析数据</div>';
      return;
    }

    var cards = [];

    // AI 摘要
    if (ai.ai_summary) {
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">AI综合摘要</div>' +
        '<div class="ai-card-body"><p style="line-height:1.7;margin:0">' + ai.ai_summary + '</p></div>' +
      '</div>');
    }

    // PE 估值
    if (ai.pe_percentile) {
      var ppText = ai.pe_percentile;
      var ppCls = ppText.indexOf('低') !== -1 ? 'ai-positive' : ppText.indexOf('高') !== -1 ? 'ai-negative' : 'ai-neutral';
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">PE估值</div>' +
        '<div class="ai-card-body"><p class="' + ppCls + '">' + ppText + '</p></div>' +
      '</div>');
    }

    // 利润趋势
    if (ai.profit_trend) {
      var ptCls = ai.profit_trend.indexOf('增长') !== -1 ? 'ai-positive' :
                  ai.profit_trend.indexOf('下滑') !== -1 ? 'ai-negative' : 'ai-neutral';
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">利润趋势</div>' +
        '<div class="ai-card-body"><p class="' + ptCls + '">' + ai.profit_trend + '</p></div>' +
      '</div>');
    }

    // 营收趋势
    if (ai.revenue_trend) {
      var rtCls = ai.revenue_trend.indexOf('增长') !== -1 ? 'ai-positive' :
                  ai.revenue_trend.indexOf('下滑') !== -1 ? 'ai-negative' : 'ai-neutral';
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">营收趋势</div>' +
        '<div class="ai-card-body"><p class="' + rtCls + '">' + ai.revenue_trend + '</p></div>' +
      '</div>');
    }

    // 技术面
    if (ai.tech_summary) {
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">技术面</div>' +
        '<div class="ai-card-body"><p style="line-height:1.7;margin:0">' + ai.tech_summary + '</p></div>' +
      '</div>');
    }

    // 风险评估
    if (ai.risk_level) {
      var rlCls = ai.risk_level.indexOf('低') !== -1 ? 'ai-positive' :
                  ai.risk_level.indexOf('高') !== -1 ? 'ai-negative' : 'ai-warning';
      var reasonsHtml = '';
      if (ai.risk_reasons && ai.risk_reasons.length) {
        reasonsHtml = '<div style="margin-top:6px;font-size:0.75rem;color:#787b86">' +
          ai.risk_reasons.map(function(r) { return '· ' + r; }).join('<br>') + '</div>';
      }
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">风险评估</div>' +
        '<div class="ai-card-body"><p class="' + rlCls + '">' + ai.risk_level + '</p>' + reasonsHtml + '</div>' +
      '</div>');
    }

    // 波动率
    if (ai.volatility !== undefined && ai.volatility !== null) {
      cards.push('<div class="ai-card">' +
        '<div class="ai-card-title">波动率</div>' +
        '<div class="ai-card-body"><p>' + (+ai.volatility).toFixed(2) + '%</p></div>' +
      '</div>');
    }

    container.innerHTML = cards.length > 0 ? cards.join('') : '<div class="no-data">暂无AI分析数据</div>';
  }

  // === 回测 Tab ===
  function renderBacktestTab() {
    var container = document.getElementById('btResults');
    container.classList.remove('active');
    document.getElementById('btMetrics').innerHTML = '';
    if (btEquityChart) { btEquityChart.dispose(); btEquityChart = null; }
    document.getElementById('btChart').innerHTML = '';
  }

  function runBacktest() {
    var detail = getCacheDetail();
    var klineData = detail.kline || [];
    if (!klineData || klineData.length < 30) {
      document.getElementById('btMetrics').innerHTML = '<div class="no-data">K线数据不足，至少需要30个交易日</div>';
      document.getElementById('btResults').classList.add('active');
      return;
    }

    var strategy = document.getElementById('btStrategy').value;
    var threshold = +document.getElementById('btThreshold').value || 40;

    var trades = [];
    var position = null; // { entryIdx, entryPrice, stopLoss }

    for (var i = 0; i < klineData.length; i++) {
      var bar = klineData[i];
      var close = +bar.close;

      if (!position) {
        // 无持仓：寻找买入信号
        var entrySignal = false;
        if (strategy === 'default') {
          // 默认策略：评分>threshold买入
          // 简化：基于K线数据的简单趋势判断
          // 如果数据中有score就用，否则用简单的趋势代理
          var score = detail.score || calcSimpleScore(klineData, i);
          entrySignal = score >= threshold;
        } else if (strategy === 'ma_cross') {
          // 均线金叉：MA5上穿MA10
          if (i >= 9) {
            var ma5Prev = calcMA5At(klineData, i - 1);
            var ma10Prev = calcMA10At(klineData, i - 1);
            var ma5Curr = calcMA5At(klineData, i);
            var ma10Curr = calcMA10At(klineData, i);
            entrySignal = ma5Prev <= ma10Prev && ma5Curr > ma10Curr;
          }
        }

        if (entrySignal) {
          // 计算止损价：买入价的95%
          var stopLoss = close * 0.95;
          position = { entryIdx: i, entryPrice: close, stopLoss: stopLoss };
        }
      } else {
        // 有持仓：检查卖出信号
        var exitSignal = false;
        var exitReason = '';

        if (strategy === 'default') {
          // 跌破止损
          if (close <= position.stopLoss) {
            exitSignal = true;
            exitReason = '止损';
          }
        } else if (strategy === 'ma_cross') {
          // 均线死叉：MA5下穿MA10
          if (i >= 1) {
            var ma5Prev2 = calcMA5At(klineData, i - 1);
            var ma10Prev2 = calcMA10At(klineData, i - 1);
            var ma5Curr2 = calcMA5At(klineData, i);
            var ma10Curr2 = calcMA10At(klineData, i);
            exitSignal = ma5Prev2 >= ma10Prev2 && ma5Curr2 < ma10Curr2;
            exitReason = '死叉';
          }
        }

        // 持仓超过60天强制卖出
        if (!exitSignal && (i - position.entryIdx) >= 60) {
          exitSignal = true;
          exitReason = '超时';
        }

        // 最后一天强制平仓
        if (!exitSignal && i === klineData.length - 1) {
          exitSignal = true;
          exitReason = '期末平仓';
        }

        if (exitSignal) {
          var exitPrice = close;
          var ret = (exitPrice - position.entryPrice) / position.entryPrice;
          trades.push({
            entryDate: klineData[position.entryIdx].date,
            exitDate: bar.date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            returnPct: ret * 100,
            win: ret > 0,
            reason: exitReason
          });
          position = null;
        }
      }
    }

    // 计算指标
    var totalReturn = 0;
    if (trades.length > 0) {
      totalReturn = trades.reduce(function(acc, t) { return acc * (1 + t.returnPct / 100); }, 1) - 1;
      totalReturn = totalReturn * 100;
    }
    var winCount = trades.filter(function(t) { return t.win; }).length;
    var winRate = trades.length > 0 ? (winCount / trades.length * 100) : 0;
    var maxDrawdown = calcMaxDrawdown(trades);

    // 渲染指标
    document.getElementById('btMetrics').innerHTML =
      '<div class="bt-metric">' +
        '<div class="bt-metric-label">总收益率</div>' +
        '<div class="bt-metric-val ' + (totalReturn >= 0 ? 'green' : 'red') + '">' + (totalReturn >= 0 ? '+' : '') + totalReturn.toFixed(2) + '%</div>' +
      '</div>' +
      '<div class="bt-metric">' +
        '<div class="bt-metric-label">胜率</div>' +
        '<div class="bt-metric-val ' + (winRate >= 50 ? 'green' : 'red') + '">' + winRate.toFixed(1) + '%</div>' +
      '</div>' +
      '<div class="bt-metric">' +
        '<div class="bt-metric-label">最大回撤</div>' +
        '<div class="bt-metric-val red">' + maxDrawdown.toFixed(2) + '%</div>' +
      '</div>' +
      '<div class="bt-metric">' +
        '<div class="bt-metric-label">交易次数</div>' +
        '<div class="bt-metric-val">' + trades.length + '</div>' +
      '</div>';

    document.getElementById('btResults').classList.add('active');

    // 权益曲线
    renderEquityCurve(trades, klineData);
  }

  function calcSimpleScore(klineData, idx) {
    // 简单趋势评分代理：最近价格上涨则得分高
    if (idx < 5) return 0;
    var recentClose = +klineData[idx].close;
    var prevClose = +klineData[idx - 5].close;
    var pct = (recentClose - prevClose) / prevClose * 100;
    var score = 30 + pct * 2;
    return Math.min(100, Math.max(0, score));
  }

  function calcMA5At(klineData, idx) {
    if (idx < 4) return +klineData[idx].close;
    var sum = 0;
    for (var i = idx - 4; i <= idx; i++) sum += +klineData[i].close;
    return sum / 5;
  }

  function calcMA10At(klineData, idx) {
    if (idx < 9) return +klineData[idx].close;
    var sum = 0;
    for (var i = idx - 9; i <= idx; i++) sum += +klineData[i].close;
    return sum / 10;
  }

  function calcMaxDrawdown(trades) {
    if (trades.length === 0) return 0;
    var equity = [1];
    trades.forEach(function(t) {
      equity.push(equity[equity.length - 1] * (1 + t.returnPct / 100));
    });
    var peak = equity[0];
    var maxDD = 0;
    for (var i = 1; i < equity.length; i++) {
      if (equity[i] > peak) peak = equity[i];
      var dd = (peak - equity[i]) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  function renderEquityCurve(trades, klineData) {
    if (btEquityChart) { btEquityChart.dispose(); btEquityChart = null; }
    var dom = document.getElementById('btChart');
    dom.innerHTML = '';
    if (trades.length === 0) {
      dom.innerHTML = '<div class="no-data" style="padding:20px">无交易记录</div>';
      return;
    }

    var equity = [1];
    var dates = ['起始'];
    trades.forEach(function(t) {
      equity.push(equity[equity.length - 1] * (1 + t.returnPct / 100));
      dates.push(t.exitDate);
    });

    btEquityChart = echarts.init(dom);
    btEquityChart.setOption({
      backgroundColor: 'transparent',
      title: { text: '权益曲线', left: 'center', top: 4, textStyle: { color: '#d1d4dc', fontSize: 13 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '8%', right: '4%', top: 40, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#787b86', fontSize: 10, rotate: 30 }, axisLine: { lineStyle: { color: '#2a2d38' } } },
      yAxis: { type: 'value', axisLabel: { color: '#787b86', fontSize: 10 }, splitLine: { lineStyle: { color: '#1a1d27' } } },
      series: [{
        name: '权益', type: 'line', data: equity,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }]) },
        symbol: 'circle',
        symbolSize: 4
      }]
    });

    window.addEventListener('resize', function() {
      if (btEquityChart && !btEquityChart.isDisposed()) btEquityChart.resize();
    });
  }

  // ==================== 渲染信号卡片 ====================
  function renderCard(signal) {
    var cls = actionClass(signal.action);
    var changeCls = changeClass(signal.change_pct);

    var reasonsHTML = '';
    if (signal.reasons && signal.reasons.length) {
      reasonsHTML = '<div class="reasons">' +
        signal.reasons.map(function(r) { return '<span class="reason-tag">' + r + '</span>'; }).join('') +
        '</div>';
    }

    var zonesHTML = '';
    if (signal.buy_zone > 0) {
      zonesHTML =
        '<div class="zones">' +
          '<div class="zone-item"><div class="zone-label">买入参考</div><div class="zone-val zone-buy">' + signal.buy_zone + '~' + signal.buy_zone_high + '</div></div>' +
          '<div class="zone-item"><div class="zone-label">止盈</div><div class="zone-val zone-sell">' + signal.take_profit + '</div></div>' +
          '<div class="zone-item"><div class="zone-label">止损</div><div class="zone-val zone-stop">' + signal.stop_loss + '</div></div>' +
        '</div>';
    }

    var metaExtra = '';
    if (signal.board_count) metaExtra += '<span>连板: <b>' + signal.board_count + '</b></span>';
    if (signal.main_net_inflow) {
      var flowStr = (signal.main_net_inflow / 1e8).toFixed(1) + '亿';
      metaExtra += '<span>主力: <b style="color:' + (signal.main_net_inflow > 0 ? 'var(--red)' : 'var(--green)') + '">' + flowStr + '</b></span>';
    }
    if (signal.pe && signal.pe > 0) metaExtra += '<span>PE: <b>' + signal.pe.toFixed(1) + '</b></span>';

    return '<div class="signal-card ' + cls + '" data-code="' + signal.code + '" data-name="' + signal.name + '">' +
      '<div class="card-head">' +
        '<div>' +
          '<span class="stock-code">' + signal.code + '</span>' +
          '<span class="stock-name">' + signal.name + '</span>' +
        '</div>' +
        '<span class="score-tag ' + cls + '">' + signal.score + '分</span>' +
      '</div>' +
      '<div class="price-row">' +
        '<span class="price">¥' + signal.price.toFixed(2) + '</span>' +
        '<span class="change-pct ' + changeCls + '">' + fmtPct(signal.change_pct) + '</span>' +
      '</div>' +
      '<div class="meta-row">' + metaExtra + '</div>' +
      reasonsHTML +
      zonesHTML +
    '</div>';
  }

  // === 渲染表格行 ===
  function renderTableRow(signal) {
    var cls = actionClass(signal.action);
    var changeCls = changeClass(signal.change_pct);
    var reasonsStr = '';
    if (signal.reasons) reasonsStr = signal.reasons.join('，');

    return '<tr data-code="' + signal.code + '" data-name="' + signal.name + '">' +
      '<td><span style="color:var(--text-dim);font-family:monospace">' + signal.code + '</span></td>' +
      '<td><b>' + signal.name + '</b></td>' +
      '<td>' + signal.price.toFixed(2) + '</td>' +
      '<td class="' + changeCls + '">' + fmtPct(signal.change_pct) + '</td>' +
      '<td><span class="score-tag ' + cls + '" style="font-size:0.7rem;padding:1px 6px">' + signal.score + '</span></td>' +
      '<td>' + actionLabel(signal.action) + '</td>' +
      '<td style="font-family:monospace">' + (signal.buy_zone > 0 ? signal.buy_zone : '-') + '</td>' +
      '<td style="font-family:monospace;color:var(--red)">' + (signal.take_profit > 0 ? signal.take_profit : '-') + '</td>' +
      '<td style="font-family:monospace;color:var(--yellow)">' + (signal.stop_loss > 0 ? signal.stop_loss : '-') + '</td>' +
      '<td style="color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis">' + reasonsStr + '</td>' +
    '</tr>';
  }

  // === 渲染涨停板表格 ===
  function renderLimitUpRow(lt) {
    var breakClass = +lt.break_times === 0 ? 'color:var(--green)' : 'color:var(--yellow)';
    var boardCount = lt.board_count ? lt.board_count : 1;

    return '<tr data-code="' + lt.code + '" data-name="' + lt.name + '">' +
      '<td style="font-family:monospace;color:var(--text-dim)">' + lt.code + '</td>' +
      '<td><b>' + lt.name + '</b></td>' +
      '<td>' + lt.price.toFixed(2) + '</td>' +
      '<td class="change-up">+' + lt.change_pct.toFixed(2) + '%</td>' +
      '<td><span style="font-weight:700;color:var(--strong)">' + boardCount + '</span></td>' +
      '<td>' + fmtAmt(lt.lock_amount) + '</td>' +
      '<td style="' + breakClass + '">' + (lt.break_times || 0) + '次</td>' +
      '<td style="color:var(--text-dim)">' + (lt.first_lock_time || '-') + '</td>' +
      '<td style="color:var(--text-dim)">' + (lt.industry || '-') + '</td>' +
    '</tr>';
  }

  // === 切换主 Tab ===
  function initTabs() {
    document.querySelectorAll('.tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
      });
    });
  }

  // === 主渲染 ===
  function render() {
    var updateTime = fmtTime(D.update_time);
    document.getElementById('updateTime').textContent = '更新：' + updateTime;
    document.getElementById('footerTime').textContent = updateTime;

    // Strong Buy
    var strongBuy = D.strong_buy || [];
    document.getElementById('strongBuyCount').textContent = strongBuy.length;
    document.getElementById('strongBuyGrid').innerHTML = strongBuy.map(renderCard).join('');

    // Buy
    var buyList = D.buy || [];
    document.getElementById('buyCount').textContent = buyList.length;
    document.getElementById('buyGrid').innerHTML = buyList.map(renderCard).join('');

    // Watch
    var watchList = D.watch || [];
    document.getElementById('watchCount').textContent = watchList.length;
    document.getElementById('watchGrid').innerHTML = watchList.map(renderCard).join('');

    // 涨停板
    var limitUp = D.limit_up_list || [];
    document.getElementById('limitUpCount').textContent = limitUp.length;
    document.getElementById('limitUpTable').querySelector('tbody').innerHTML =
      limitUp.map(renderLimitUpRow).join('');

    // 综合排名
    var topSignals = D.top_signals || [];
    document.getElementById('topTable').querySelector('tbody').innerHTML =
      topSignals.map(renderTableRow).join('');

    // 绑定卡片点击事件
    bindCardClicks();
  }

  function bindCardClicks() {
    // 信号卡片
    document.querySelectorAll('.signal-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        // 防止点击内部元素导致冒泡问题
        var code = this.getAttribute('data-code');
        var name = this.getAttribute('data-name');
        openDetail(code, name);
      });
    });

    // 表格行
    document.querySelectorAll('.data-table tbody tr').forEach(function(row) {
      row.addEventListener('click', function() {
        var code = this.getAttribute('data-code');
        var name = this.getAttribute('data-name');
        if (code) openDetail(code, name);
      });
    });
  }

  // === 弹窗事件绑定 ===
  function initModal() {
    // 关闭按钮
    document.getElementById('detailClose').addEventListener('click', closeDetail);

    // 点击遮罩关闭
    document.getElementById('detailOverlay').addEventListener('click', function(e) {
      if (e.target === this) closeDetail();
    });

    // ESC 关闭
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeDetail();
    });

    // 详情Tabs切换
    document.querySelectorAll('#detailTabs .modal-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchDetailTab(this.getAttribute('data-dtab'));
      });
    });

    // 回测运行按钮
    document.getElementById('btRun').addEventListener('click', runBacktest);
  }

  // === 入口 ===
  if (D.update_time) {
    searchIndex = buildSearchIndex();
    render();
  } else {
    document.getElementById('updateTime').textContent = '数据加载失败，请刷新';
  }

  initTabs();
  initSearch();
  initModal();
})();
