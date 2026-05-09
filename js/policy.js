/**
 * Handly Stock — 政策研判 Tab v2
 * 事件委托方式：点击板块/热词展开股票列表
 */
(function() {
  'use strict';

  var D = window.POLICY_DATA;
  if (!D) { console.log('[政策研判] 无数据'); return; }

  var cctv = D.cctv_analysis || {};
  var cross = D.cross_analysis || {};
  var news = D.news_hotwords || {};
  var indStocks = D.industry_stocks || {};

  // ==================== 更新时间 ====================
  var timeEl = document.getElementById('policyUpdateTime');
  if (timeEl) timeEl.textContent = D.analysis_time || '--';

  // ==================== 新闻联播信号 ====================
  function renderCctvSignals() {
    var el = document.getElementById('cctvSignals');
    if (!el) return;
    if (!cctv.total_items) {
      el.innerHTML = '<div class="policy-empty">暂无新闻联播数据</div>';
      return;
    }
    var items = cctv.market_moving_items || [];
    var html = '<div class="cctv-summary"><strong>' +
      escHtml(cctv.daily_summary || '') + '</strong> | ' +
      cctv.total_items + '条新闻, ' + items.length + '条影响市场</div>';
    html += '<div class="cctv-items">';
    for (var i = 0; i < Math.min(items.length, 8); i++) {
      var item = items[i];
      var intensity = item.intensity || 0;
      var cls = intensity >= 9 ? 'high' : intensity >= 7 ? 'mid' : 'low';
      var sigs = (item.signals || []).slice(0, 4).join(' · ');
      var inds = (item.industries || []).slice(0, 4);
      html += '<div class="cctv-item cctv-' + cls + '">' +
        '<span class="cctv-score">' + intensity + '</span>' +
        '<div class="cctv-body">' +
        '<div class="cctv-title">' + escHtml(item.title || '') + '</div>' +
        '<div class="cctv-meta">信号: ' + escHtml(sigs) + '</div>';
      if (inds.length) {
        html += '<div class="cctv-inds">影响: ' + escHtml(inds.join('、')) + '</div>';
      }
      html += '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // ==================== 共振板块 ====================
  function renderCrossHits() {
    var el = document.getElementById('crossHits');
    if (!el) return;
    var hits = cross.cross_hits || [];
    if (!hits.length) {
      el.innerHTML = '<div class="policy-empty">暂无共振板块</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var stocks = indStocks[h.industry] || [];
      var confCls = h.confidence === '高' ? 'conf-high' : 'conf-mid';
      html += '<div class="hit-card">' +
        '<div class="hit-header expand-trigger" data-target="hit-' + i + '">' +
        '<div class="hit-name">' + escHtml(h.industry) +
        ' <span class="expand-arrow" id="arrow-hit-' + i + '">▶</span></div>' +
        '<div class="hit-stats">' +
        '<span>政策 ' + h.cctv_strength + '</span>' +
        '<span>涨停 ' + h.market_count + '只</span>' +
        (stocks.length ? '<span>📊' + stocks.length + '股</span>' : '') +
        '</div>' +
        '<span class="hit-conf ' + confCls + '">' + h.confidence + '可信</span>' +
        '</div>' +
        '<div class="expand-stocks" id="expand-hit-' + i + '" style="display:none">' +
        renderStockList(stocks, h.industry) +
        '</div></div>';
    }
    el.innerHTML = html;
  }

  // ==================== 政策待兑现 ====================
  function renderCrossMisses() {
    var el = document.getElementById('crossMisses');
    if (!el) return;
    var misses = cross.misses || [];
    if (!misses.length) {
      el.innerHTML = '<div class="policy-empty">所有板块已反应</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < misses.length; i++) {
      var m = misses[i];
      var stocks = indStocks[m.industry] || [];
      html += '<div class="miss-card">' +
        '<div class="miss-header expand-trigger" data-target="miss-' + i + '">' +
        '<div class="miss-name">' + escHtml(m.industry) +
        ' <span class="expand-arrow" id="arrow-miss-' + i + '">▶</span></div>' +
        '<div class="miss-strength">政策强度 ' + m.cctv_strength +
        (stocks.length ? ' | 📊' + stocks.length + '股' : '') +
        '</div>' +
        '<div class="miss-note">' + escHtml(m.note || '资金尚未反应') + '</div>' +
        '</div>' +
        '<div class="expand-stocks" id="expand-miss-' + i + '" style="display:none">' +
        renderStockList(stocks, m.industry) +
        '</div></div>';
    }
    el.innerHTML = html;
  }

  // ==================== 财经热词 ====================
  function renderNewsHotwords() {
    var el = document.getElementById('newsHotwords');
    if (!el) return;
    var matched = news.matched || [];
    var html = '<div class="hotword-label">匹配政策 <small>(点击查看股票)</small></div>';
    if (matched.length) {
      for (var i = 0; i < matched.length; i++) {
        var w = matched[i];
        var kw = w[0] || w;
        var stocks = findStocksByKeyword(kw);
        html += '<span class="hotword-tag hotword-policy expand-trigger" data-target="kw-p-' + i + '">' +
          escHtml(kw) + ' <small>' + (w[1] || '') + '</small>' +
          (stocks.length ? ' 📊' + stocks.length : '') +
          '</span>';
        html += '<div class="expand-stocks kw-expand" id="expand-kw-p-' + i + '" style="display:none">' +
          renderStockList(stocks) + '</div>';
      }
    } else {
      html += '<span class="hotword-none">--</span>';
    }
    html += '<div class="hotword-label" style="margin-top:12px">新兴词汇 <small>(点击查看)</small></div>';
    var newsWords = news.new_words || [];
    if (newsWords.length) {
      for (var j = 0; j < Math.min(newsWords.length, 10); j++) {
        var nw = newsWords[j];
        var nkw = nw[0] || nw;
        var nstocks = findStocksByKeyword(nkw);
        html += '<span class="hotword-tag hotword-new expand-trigger" data-target="kw-n-' + j + '">' +
          escHtml(nkw) + ' <small>' + (nw[1] || '') + '</small>' +
          (nstocks.length ? ' 📊' + nstocks.length : '') +
          '</span>';
        html += '<div class="expand-stocks kw-expand" id="expand-kw-n-' + j + '" style="display:none">' +
          renderStockList(nstocks) + '</div>';
      }
    } else {
      html += '<span class="hotword-none">--</span>';
    }
    el.innerHTML = html;
  }

  // ==================== 股票列表渲染 ====================
  function renderStockList(stocks, industryName) {
    if (!stocks || !stocks.length) {
      var msg = '暂无相关股票数据';
      if (industryName) {
        msg = '「' + escHtml(industryName) + '」周五无涨停股 — 行业缓存未覆盖，等交易日数据更新';
      }
      return '<div class="stock-list-empty">' + msg + '</div>';
    }
    var html = '<div class="stock-list">';
    for (var i = 0; i < Math.min(stocks.length, 15); i++) {
      var s = stocks[i];
      var changeCls = s.change_pct >= 0 ? 'up' : 'down';
      var pct = s.change_pct != null ? (s.change_pct > 0 ? '+' : '') + s.change_pct.toFixed(1) + '%' : '-';
      var extra = '';
      if (s.board_count > 0) extra += ' <span class="tag-board">' + s.board_count + '连板</span>';
      if (s.source === 'potential') extra += ' <span class="tag-potential">潜力</span>';
      if (s.score) extra += ' <span class="tag-score">' + s.score + '分</span>';
      html += '<div class="stock-row clickable-row" data-code="' + escHtml(s.code) + '">' +
        '<span class="sr-code">' + escHtml(s.code) + '</span>' +
        '<span class="sr-name">' + escHtml(s.name) + '</span>' +
        '<span class="sr-price">' + (s.price || '-') + '</span>' +
        '<span class="sr-change ' + changeCls + '">' + pct + '</span>' +
        extra +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function findStocksByKeyword(keyword) {
    var results = [];
    var seen = {};
    for (var ind in indStocks) {
      if (ind.indexOf(keyword) >= 0 || keyword.indexOf(ind) >= 0 ||
          keyword.indexOf(ind.substring(0, 2)) >= 0) {
        for (var s = 0; s < indStocks[ind].length; s++) {
          var stock = indStocks[ind][s];
          if (!seen[stock.code]) {
            seen[stock.code] = true;
            results.push(stock);
          }
        }
      }
    }
    return results.slice(0, 20);
  }

  // ==================== 潜力股表格 ====================
  function renderPotentialTable() {
    var tbody = document.querySelector('#policyPotentialsTable tbody');
    if (!tbody) return;
    var opps = cross.opportunities || [];
    if (!opps.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">暂无匹配潜力股</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(opps.length, 20); i++) {
      var o = opps[i];
      var reasons = (o.reasons || []).join(' | ');
      html += '<tr class="clickable-row" data-code="' + escHtml(o.code) + '">' +
        '<td>' + escHtml(o.code) + '</td>' +
        '<td>' + escHtml(o.name) + '</td>' +
        '<td>' + escHtml(o.industry || '-') + '</td>' +
        '<td class="score-cell">' + o.score + '</td>' +
        '<td>' + (o.cctv_strength || 0) + '</td>' +
        '<td class="reasons-cell">' + escHtml(reasons) + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  }

  // ==================== AI 研判摘要 ====================
  function renderAISummary() {
    var el = document.getElementById('aiSummaryContent');
    if (!el) return;
    var hits = cross.cross_hits || [];
    var misses = cross.misses || [];
    var opps = cross.opportunities || [];
    var cctvItems = cctv.market_moving_items || [];
    var lines = [];
    if (cctvItems.length) {
      lines.push('<p><strong>📺 今日政策头条：</strong>' + escHtml(cctvItems[0].title || '') + '</p>');
    }
    if (hits.length) {
      var hitNames = hits.map(function(h) { return h.industry; }).join('、');
      lines.push('<p><strong>🔀 政策+资金共振：</strong>' + hitNames +
        ' — 点击板块名展开查看相关股票。</p>');
    }
    if (misses.length) {
      var missNames = misses.slice(0, 4).map(function(m) { return m.industry; }).join('、');
      lines.push('<p><strong>⏳ 政策待兑现：</strong>' + missNames +
        ' — 政策已点名但资金未反应，点击查看。</p>');
    }
    if (opps.length) {
      lines.push('<p><strong>🎯 建议关注：</strong>' +
        opps.slice(0, 3).map(function(o) { return o.name + '(' + o.code + ')'; }).join('、') +
        ' — 技术面+政策面共振。</p>');
    }
    lines.push('<p class="disclaimer">以上分析基于新闻联播文本+市场数据自动生成，仅供参考。数据更新时间：' +
      (D.analysis_time || '--') + '</p>');
    el.innerHTML = lines.join('');
  }

  // ==================== 事件委托：统一处理展开/折叠 ====================
  function setupDelegation() {
    // 在 policy-dashboard 上监听所有点击
    var dash = document.querySelector('.policy-dashboard');
    if (!dash) return;

    dash.addEventListener('click', function(e) {
      var trigger = e.target.closest('.expand-trigger');
      if (!trigger) return;

      var targetId = trigger.getAttribute('data-target');
      if (!targetId) return;

      var expandEl = document.getElementById('expand-' + targetId);
      var arrowEl = document.getElementById('arrow-' + targetId);

      if (!expandEl) return;

      if (expandEl.style.display === 'none') {
        expandEl.style.display = 'block';
        if (arrowEl) arrowEl.textContent = '▼';
      } else {
        expandEl.style.display = 'none';
        if (arrowEl) arrowEl.textContent = '▶';
      }
    });

    // 热词区域也需要监听（可能在 policy-dashboard 外）
    var newsEl = document.getElementById('newsHotwords');
    if (newsEl) {
      newsEl.addEventListener('click', function(e) {
        var trigger = e.target.closest('.expand-trigger');
        if (!trigger) return;
        var targetId = trigger.getAttribute('data-target');
        if (!targetId) return;
        var expandEl = document.getElementById('expand-' + targetId);
        if (!expandEl) return;
        if (expandEl.style.display === 'none') {
          expandEl.style.display = 'block';
        } else {
          expandEl.style.display = 'none';
        }
      });
    }
  }

  // ==================== 全部渲染 ====================
  function renderAll() {
    renderCctvSignals();
    renderCrossHits();
    renderCrossMisses();
    renderNewsHotwords();
    renderPotentialTable();
    renderAISummary();
    setupDelegation();
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();
