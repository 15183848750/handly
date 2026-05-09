/**
 * Handly Stock — 政策研判 Tab
 * 数据源: daily_analysis.json → window.POLICY_DATA
 */
(function() {
  'use strict';

  var D = window.POLICY_DATA;
  if (!D) {
    // 无数据时在 console 提示，不影响其他功能
    console.log('[政策研判] 无 POLICY_DATA，跳过渲染');
    return;
  }

  var cctv = D.cctv_analysis || {};
  var cross = D.cross_analysis || {};
  var news = D.news_hotwords || {};

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
    var html = '<div class="cctv-summary">' +
      '<strong>' + (cctv.daily_summary || '') + '</strong> | ' +
      cctv.total_items + '条新闻, ' + items.length + '条影响市场' +
      '</div>';

    html += '<div class="cctv-items">';
    for (var i = 0; i < Math.min(items.length, 8); i++) {
      var item = items[i];
      var intensity = item.intensity || 0;
      var cls = intensity >= 9 ? 'high' : intensity >= 7 ? 'mid' : 'low';
      var sigs = (item.signals || []).slice(0, 4).join(' · ');
      var inds = (item.industries || []).slice(0, 4).join('、');
      html += '<div class="cctv-item cctv-' + cls + '">' +
        '<span class="cctv-score">' + intensity + '</span>' +
        '<div class="cctv-body">' +
        '<div class="cctv-title">' + escHtml(item.title || '') + '</div>' +
        '<div class="cctv-meta">信号: ' + escHtml(sigs) + '</div>';
      if (inds) {
        html += '<div class="cctv-inds">影响: ' + escHtml(inds) + '</div>';
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
      var confCls = h.confidence === '高' ? 'conf-high' : 'conf-mid';
      html += '<div class="hit-card">' +
        '<div class="hit-name">' + escHtml(h.industry) + '</div>' +
        '<div class="hit-stats">' +
        '<span>政策 ' + h.cctv_strength + '</span>' +
        '<span>涨停 ' + h.market_count + '只</span>' +
        '</div>' +
        '<span class="hit-conf ' + confCls + '">' + h.confidence + '可信</span>' +
        '</div>';
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
      html += '<div class="miss-card">' +
        '<div class="miss-name">' + escHtml(m.industry) + '</div>' +
        '<div class="miss-strength">政策强度 ' + m.cctv_strength + '</div>' +
        '<div class="miss-note">' + escHtml(m.note || '资金尚未反应') + '</div>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  // ==================== 财经热词 ====================
  function renderNewsHotwords() {
    var el = document.getElementById('newsHotwords');
    if (!el) return;
    var matched = news.matched || [];
    var html = '<div class="hotword-label">匹配政策</div>';
    if (matched.length) {
      for (var i = 0; i < matched.length; i++) {
        var w = matched[i];
        html += '<span class="hotword-tag hotword-policy">' +
          escHtml(w[0] || w) + ' <small>' + (w[1] || '') + '</small></span>';
      }
    } else {
      html += '<span class="hotword-none">--</span>';
    }

    html += '<div class="hotword-label" style="margin-top:12px">新兴词汇</div>';
    var news_words = news.new_words || [];
    if (news_words.length) {
      for (var j = 0; j < Math.min(news_words.length, 10); j++) {
        var nw = news_words[j];
        html += '<span class="hotword-tag hotword-new">' +
          escHtml(nw[0] || nw) + ' <small>' + (nw[1] || '') + '</small></span>';
      }
    } else {
      html += '<span class="hotword-none">--</span>';
    }
    el.innerHTML = html;
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

    // 构建结构化摘要
    var lines = [];

    // 新闻联播核心
    if (cctvItems.length) {
      var top = cctvItems[0];
      lines.push('<p><strong>📺 今日政策头条：</strong>' + escHtml(top.title || '') + '</p>');
    } else {
      lines.push('<p><strong>📺 今日政策头条：</strong>无信号</p>');
    }

    // 共振
    if (hits.length) {
      var hitNames = hits.map(function(h) { return h.industry; }).join('、');
      lines.push('<p><strong>🔀 政策+资金共振：</strong>' + hitNames +
        ' — 这些板块既有新闻联播点名，又有市场资金响应，确定性较高。</p>');
    }

    // 待兑现
    if (misses.length) {
      var missNames = misses.slice(0, 4).map(function(m) { return m.industry; }).join('、');
      lines.push('<p><strong>⏳ 政策待兑现机会：</strong>' + missNames +
        ' — 新闻联播已点名但市场资金尚未反应，是下周最值得关注的低吸方向。</p>');
    }

    // 潜力股
    if (opps.length) {
      lines.push('<p><strong>🎯 建议关注：</strong>' +
        opps.slice(0, 3).map(function(o) {
          return o.name + '(' + o.code + ')';
        }).join('、') +
        ' — 技术面低位+量能异动+政策催化三重共振。</p>');
    }

    // 风险提示
    var newWords = (news.new_words || []).map(function(w) { return w[0] || w; });
    var riskWords = ['中东', '伊朗', '石油', '霍尔木兹', '特朗普', '关税', '制裁'];
    var hasRisk = newWords.some(function(w) { return riskWords.indexOf(w) >= 0; });
    if (hasRisk) {
      lines.push('<p class="risk-note">⚠️ <strong>风险提示：</strong>财经新闻中出现地缘政治热词（中东/伊朗/海峡），关注周末局势变化，若升级可能带来短期波动。</p>');
    }

    lines.push('<p class="disclaimer">以上分析基于新闻联播文本+市场数据自动生成，仅供参考，不构成投资建议。数据更新时间：' +
      (D.analysis_time || '--') + '</p>');

    el.innerHTML = lines.join('');
  }

  // ==================== 全部渲染 ====================
  function renderAll() {
    renderCctvSignals();
    renderCrossHits();
    renderCrossMisses();
    renderNewsHotwords();
    renderPotentialTable();
    renderAISummary();
  }

  // ==================== 工具 ====================
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 渲染
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }

})();
