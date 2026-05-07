/**
 * Handly Stock — 前端 Dashboard
 * 纯静态，从 window.SIGNALS_DATA 读取数据
 */

(function() {
  'use strict';

  const D = window.SIGNALS_DATA || {};

  // === 工具函数 ===
  function fmtAmt(val) {
    if (!val) return '-';
    const n = +val;
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(0) + '万';
    return n.toFixed(0);
  }

  function fmtPct(val) {
    if (val === undefined || val === null) return '-';
    const n = +val;
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
    if (!ts) return '--';
    return ts;
  }

  // === 渲染信号卡片 ===
  function renderCard(signal) {
    const cls = actionClass(signal.action);
    const changeCls = changeClass(signal.change_pct);

    let reasonsHTML = '';
    if (signal.reasons && signal.reasons.length) {
      reasonsHTML = '<div class="reasons">' +
        signal.reasons.map(r => `<span class="reason-tag">${r}</span>`).join('') +
        '</div>';
    }

    let zonesHTML = '';
    if (signal.buy_zone > 0) {
      zonesHTML = `
        <div class="zones">
          <div class="zone-item">
            <div class="zone-label">买入参考</div>
            <div class="zone-val zone-buy">${signal.buy_zone}~${signal.buy_zone_high}</div>
          </div>
          <div class="zone-item">
            <div class="zone-label">止盈</div>
            <div class="zone-val zone-sell">${signal.take_profit}</div>
          </div>
          <div class="zone-item">
            <div class="zone-label">止损</div>
            <div class="zone-val zone-stop">${signal.stop_loss}</div>
          </div>
        </div>`;
    }

    let metaExtra = '';
    if (signal.board_count) {
      metaExtra += `<span>连板: <b>${signal.board_count}</b></span>`;
    }
    if (signal.main_net_inflow) {
      const flowStr = (signal.main_net_inflow / 1e8).toFixed(1) + '亿';
      metaExtra += `<span>主力: <b style="color:${signal.main_net_inflow>0?'var(--red)':'var(--green)'}">${flowStr}</b></span>`;
    }
    if (signal.pe && signal.pe > 0) {
      metaExtra += `<span>PE: <b>${signal.pe.toFixed(1)}</b></span>`;
    }

    return `
      <div class="signal-card ${cls}">
        <div class="card-head">
          <div>
            <span class="stock-code">${signal.code}</span>
            <span class="stock-name">${signal.name}</span>
          </div>
          <span class="score-tag ${cls}">${signal.score}分</span>
        </div>
        <div class="price-row">
          <span class="price">¥${signal.price.toFixed(2)}</span>
          <span class="change-pct ${changeCls}">${fmtPct(signal.change_pct)}</span>
        </div>
        <div class="meta-row">${metaExtra}</div>
        ${reasonsHTML}
        ${zonesHTML}
      </div>`;
  }

  // === 渲染表格行 ===
  function renderTableRow(signal) {
    const cls = actionClass(signal.action);
    const changeCls = changeClass(signal.change_pct);

    let reasonsStr = '';
    if (signal.reasons) reasonsStr = signal.reasons.join('，');

    return `
      <tr>
        <td><span style="color:var(--text-dim);font-family:monospace">${signal.code}</span></td>
        <td><b>${signal.name}</b></td>
        <td>${signal.price.toFixed(2)}</td>
        <td class="${changeCls}">${fmtPct(signal.change_pct)}</td>
        <td><span class="score-tag ${cls}" style="font-size:0.7rem;padding:1px 6px">${signal.score}</span></td>
        <td>${actionLabel(signal.action)}</td>
        <td style="font-family:monospace">${signal.buy_zone > 0 ? signal.buy_zone : '-'}</td>
        <td style="font-family:monospace;color:var(--red)">${signal.take_profit > 0 ? signal.take_profit : '-'}</td>
        <td style="font-family:monospace;color:var(--yellow)">${signal.stop_loss > 0 ? signal.stop_loss : '-'}</td>
        <td style="color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis">${reasonsStr}</td>
      </tr>`;
  }

  // === 渲染涨停板表格 ===
  function renderLimitUpRow(lt) {
    const breakClass = +lt.break_times === 0 ? 'color:var(--green)' : 'color:var(--yellow)';
    const boardCount = lt.board_count ? lt.board_count : 1;

    return `
      <tr>
        <td style="font-family:monospace;color:var(--text-dim)">${lt.code}</td>
        <td><b>${lt.name}</b></td>
        <td>${lt.price.toFixed(2)}</td>
        <td class="change-up">+${lt.change_pct.toFixed(2)}%</td>
        <td><span style="font-weight:700;color:var(--strong)">${boardCount}</span></td>
        <td>${fmtAmt(lt.lock_amount)}</td>
        <td style="${breakClass}">${lt.break_times || 0}次</td>
        <td style="color:var(--text-dim)">${lt.first_lock_time || '-'}</td>
        <td style="color:var(--text-dim)">${lt.industry || '-'}</td>
      </tr>`;
  }

  // === 切换 Tab ===
  function initTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
      });
    });
  }

  // === 主渲染 ===
  function render() {
    const updateTime = fmtTime(D.update_time);
    document.getElementById('updateTime').textContent = '更新：' + updateTime;
    document.getElementById('footerTime').textContent = updateTime;

    // Strong Buy
    const strongBuy = D.strong_buy || [];
    document.getElementById('strongBuyCount').textContent = strongBuy.length;
    document.getElementById('strongBuyGrid').innerHTML = strongBuy.map(renderCard).join('');

    // Buy
    const buyList = D.buy || [];
    document.getElementById('buyCount').textContent = buyList.length;
    document.getElementById('buyGrid').innerHTML = buyList.map(renderCard).join('');

    // Watch
    const watchList = D.watch || [];
    document.getElementById('watchCount').textContent = watchList.length;
    document.getElementById('watchGrid').innerHTML = watchList.map(renderCard).join('');

    // 涨停板
    const limitUp = D.limit_up_list || [];
    document.getElementById('limitUpCount').textContent = limitUp.length;
    document.getElementById('limitUpTable').querySelector('tbody').innerHTML =
      limitUp.map(renderLimitUpRow).join('');

    // 综合排名
    const topSignals = D.top_signals || [];
    document.getElementById('topTable').querySelector('tbody').innerHTML =
      topSignals.map(renderTableRow).join('');
  }

  // === 入口 ===
  if (D.update_time) {
    render();
  } else {
    document.getElementById('updateTime').textContent = '数据加载失败，请刷新';
  }

  initTabs();
})();
