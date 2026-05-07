#!/usr/bin/env python3
"""
Handly Stock — 每日增量更新脚本
- 信号计算 + 搜索索引（全量）
- 增量更新 details/{code}.json（只追加最新K线，更新财务）
- 输出精简版 signals.json（不含 details 大对象）

用法: python3 scripts/update_daily.py
"""

import json
import os
import sys
import time
import pandas as pd
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DETAILS_DIR = os.path.join(PROJECT_DIR, 'details')
OUTPUT_DIR = os.path.join(PROJECT_DIR, 'output')

sys.path.insert(0, os.path.join(PROJECT_DIR, 'data'))
from pipeline import (
    fetch_all_market, fetch_limit_up, fetch_lhb, fetch_fund_flow,
    compute_signals, build_stock_index
)

# 导入 init_batch 中的辅助函数
sys.path.insert(0, SCRIPT_DIR)
from init_batch import fetch_kline, fetch_financial_detail, fetch_news, compute_ai_analysis

os.makedirs(DETAILS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def incremental_update_kline(code, existing_detail):
    """增量更新K线：只取最新数据追加"""
    existing_kline = existing_detail.get('kline', [])

    # 找到最后日期
    if existing_kline:
        last_date_str = existing_kline[-1].get('date', '20240101')
        try:
            last_date = datetime.strptime(last_date_str[:10], '%Y-%m-%d')
        except:
            last_date = datetime(2024, 1, 1)
        start_date = (last_date + timedelta(days=1)).strftime('%Y%m%d')
    else:
        start_date = '20240501'

    end_date = datetime.now().strftime('%Y%m%d')

    # 如果开始日期已经是今天或未来，无需更新
    if start_date >= end_date:
        return existing_kline

    try:
        new_data = fetch_kline(code, start_date=start_date, end_date=end_date)
        if new_data:
            # 去重后合并
            existing_dates = {k.get('date', '') for k in existing_kline}
            merged = existing_kline + [k for k in new_data if k.get('date', '') not in existing_dates]
            # 按日期排序，保留最近500条
            merged.sort(key=lambda x: x.get('date', ''))
            if len(merged) > 500:
                merged = merged[-500:]
            return merged
        return existing_kline
    except Exception as e:
        print(f"    ⚠ K线增量失败 {code}: {e}")
        return existing_kline


def update_stock_detail(code, signal):
    """更新或创建单只股票的 detail 文件"""
    detail_path = os.path.join(DETAILS_DIR, f'{code}.json')

    existing = {}
    if os.path.exists(detail_path):
        try:
            with open(detail_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
        except:
            pass

    # 增量更新K线
    kline = incremental_update_kline(code, existing)

    # 更新财务（只在有变化时重新获取）
    financials = existing.get('financials', {})
    if not financials or not financials.get('summary', {}).get('report_period'):
        try:
            financials = fetch_financial_detail(code)
        except:
            pass

    # 新闻（每天更新）
    try:
        news = fetch_news(code)
    except:
        news = existing.get('news', [])

    # AI 分析（重新计算）
    ai = compute_ai_analysis(signal, financials, kline) if kline else {}

    detail = {
        'code': code,
        'signal': signal,
        'financials': financials,
        'kline': kline,
        'news': news,
        'ai_analysis': ai,
        'update_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }

    with open(detail_path, 'w', encoding='utf-8') as f:
        json.dump(detail, f, ensure_ascii=False, indent=2)

    return detail


def run_daily():
    """执行每日增量更新"""
    start = datetime.now()
    print(f"=== Handly Stock 每日增量更新 {start.strftime('%Y-%m-%d %H:%M:%S')} ===")

    # 周末跳过
    if start.weekday() >= 5:
        print("周末，跳过")
        return

    # 1. 基础数据
    all_market = fetch_all_market()
    limit_up = fetch_limit_up()
    lhb = fetch_lhb()

    focus_codes = set()
    if len(limit_up) > 0:
        focus_codes.update(limit_up['code'].tolist())
    if len(lhb) > 0:
        focus_codes.update(lhb['code'].tolist())
    fund_flow_data = fetch_fund_flow(list(focus_codes)[:100])

    # 2. 信号计算
    signals = compute_signals(all_market, limit_up, fund_flow_data, lhb)
    stock_index = build_stock_index(all_market)

    # 3. 构建信号字典（用于 detail 文件的 signal 字段）
    signal_dict = {}
    for s in signals:
        signal_dict[s['code']] = s

    # 4. 增量更新已有 detail 文件 + 为 top 200 信号股创建新文件
    print(f"\n[增量更新] 更新 detail 文件...")
    existing_files = set()
    if os.path.exists(DETAILS_DIR):
        for f in os.listdir(DETAILS_DIR):
            if f.endswith('.json'):
                existing_files.add(f.replace('.json', ''))

    # 需要更新的代码：已有文件 + top200 信号股
    top200_codes = [s['code'] for s in signals[:200]]
    update_codes = set(existing_files) | set(top200_codes)
    print(f"  已有: {len(existing_files)} 只, top200: {len(top200_codes)} 只, 合计更新: {len(update_codes)} 只")

    updated = 0
    for i, code in enumerate(sorted(update_codes)):
        if i % 50 == 0:
            print(f"  进度: {i}/{len(update_codes)}")

        signal = signal_dict.get(code, {
            'code': code, 'name': '', 'price': 0, 'change_pct': 0,
            'pe': 0, 'pb': 0, 'turnover': 0, 'change_60d': 0, 'change_ytd': 0
        })

        try:
            update_stock_detail(code, signal)
            updated += 1
        except Exception as e:
            pass

        time.sleep(0.1)  # 限速

    detail_count = len([f for f in os.listdir(DETAILS_DIR) if f.endswith('.json')])
    print(f"  完成: {updated} 只更新, 总计 {detail_count} 只")

    # 5. 输出 signals.json（精简版，不含 details 大对象）
    output = {
        'update_time': start.strftime('%Y-%m-%d %H:%M:%S'),
        'total_stocks': len(all_market),
        'limit_up_count': len(limit_up),
        'lhb_count': len(lhb),
        'strong_buy': [s for s in signals if s['action'] == 'strong_buy'],
        'buy': [s for s in signals if s['action'] == 'buy'],
        'watch': [s for s in signals if s['action'] == 'watch'][:100],
        'top_signals': signals[:50],
        'limit_up_list': limit_up.to_dict('records') if len(limit_up) > 0 else [],
        'stock_index': stock_index,
        'detail_count': detail_count,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(os.path.join(OUTPUT_DIR, 'signals.json'), 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n=== 完成! 耗时 {elapsed:.1f}s ===")
    print(f"  信号: strong_buy={len(output['strong_buy'])}, buy={len(output['buy'])}, watch={len(output['watch'])}")
    print(f"  detail 文件: {detail_count} 只")


if __name__ == '__main__':
    run_daily()
