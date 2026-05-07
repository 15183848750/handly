#!/usr/bin/env python3
"""
Handly Stock — 批量全量初始化脚本
分批次为全市场 5849 只股票生成 details/{code}.json 独立文件

用法:
  python3 init_batch.py --batch 0    # 跑第 0 批 (股票 0-499)
  python3 init_batch.py --batch 5    # 跑第 5 批 (股票 2500-2999)
  python3 init_batch.py --batch all  # 跑全部 (慎用，需数小时)
  
每批约 500 只，每批耗时 ~15-25 分钟
"""

import akshare as ak
import pandas as pd
import json
import os
import sys
import time
import argparse
from datetime import datetime, timedelta

# 配置
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DETAILS_DIR = os.path.join(PROJECT_DIR, 'details')
BATCH_SIZE = 500
KLINE_START = '20240501'  # 拉到 2024年5月，约 500 个交易日
KLINE_END = datetime.now().strftime('%Y%m%d')

os.makedirs(DETAILS_DIR, exist_ok=True)


def get_market(code):
    """根据股票代码判断市场"""
    if code.startswith('6'):
        return 'sh'
    elif code.startswith(('0', '3')):
        return 'sz'
    elif code.startswith(('4', '8')):
        return 'bj'
    return 'sz'


def fetch_kline(code, start_date=KLINE_START, end_date=KLINE_END):
    """获取个股历史K线，返回最近500条"""
    try:
        df = ak.stock_zh_a_hist(
            symbol=code, period='daily',
            start_date=start_date, end_date=end_date,
            adjust='qfq'
        )
        if len(df) == 0:
            return []
        if len(df) > 500:
            df = df.iloc[-500:]

        df = df.rename(columns={
            '日期': 'date', '开盘': 'open', '收盘': 'close',
            '最高': 'high', '最低': 'low', '成交量': 'volume',
            '成交额': 'turnover',
        })
        cols = ['date', 'open', 'close', 'high', 'low', 'volume', 'turnover']
        df = df[[c for c in cols if c in df.columns]]
        records = []
        for _, row in df.iterrows():
            rec = {}
            for c in cols:
                if c in df.columns:
                    val = row[c]
                    rec[c] = str(val) if c == 'date' else (float(val) if not pd.isna(val) else 0)
            records.append(rec)
        return records
    except Exception as e:
        return []


def fetch_financial_detail(code):
    """获取财务数据"""
    try:
        df = ak.stock_financial_abstract_ths(symbol=code, indicator='按报告期')
        if len(df) == 0:
            return {}

        latest = df.iloc[-1]
        result = {
            'summary': {
                'net_profit': _s(latest.get('净利润')),
                'net_profit_yoy': _s(latest.get('净利润同比增长率')),
                'revenue': _s(latest.get('营业总收入')),
                'revenue_yoy': _s(latest.get('营业总收入同比增长率')),
                'eps': _s(latest.get('基本每股收益')),
                'roe': _s(latest.get('净资产收益率')),
                'net_margin': _s(latest.get('销售净利率')),
                'debt_ratio': _s(latest.get('资产负债率')),
                'report_period': _s(latest.get('报告期')),
            },
            'quarterly_trend': []
        }
        # 最近4个季度
        for i in range(max(0, len(df) - 4), len(df)):
            row = df.iloc[i]
            result['quarterly_trend'].append({
                'report_period': _s(row.get('报告期')),
                'revenue': _s(row.get('营业总收入')),
                'net_profit': _s(row.get('净利润')),
            })
        return result
    except Exception:
        return {}


def fetch_news(code):
    """获取个股新闻"""
    try:
        df = ak.stock_news_em(symbol=code)
        if len(df) == 0:
            return []
        news = []
        for _, row in df.head(5).iterrows():
            news.append({
                'title': _s(row.get('标题', row.get('title', ''))),
                'time': _s(row.get('发布时间', row.get('time', ''))),
                'source': _s(row.get('来源', row.get('source', ''))),
            })
        return news
    except Exception:
        return []


def compute_ai_analysis(signal, financials, kline_data):
    """规则化AI分析"""
    pe = signal.get('pe', 0)
    pb = signal.get('pb', 0)
    turnover = signal.get('turnover', 0)
    change_60d = signal.get('change_60d', 0)
    change_ytd = signal.get('change_ytd', 0)

    fin = financials.get('summary', {}) if financials else {}

    analysis = {}

    # PE 估值分位
    if pe <= 0:
        analysis['pe_percentile'] = '暂无数据(亏损)'
    elif pe < 20:
        analysis['pe_percentile'] = '低估值'
    elif pe < 50:
        analysis['pe_percentile'] = '估值合理'
    else:
        analysis['pe_percentile'] = '高估值'

    # 利润趋势
    npy = str(fin.get('net_profit_yoy', '')).replace('%', '').strip()
    try:
        npy_val = float(npy)
        analysis['profit_trend'] = '利润增长' if npy_val > 0 else '利润下滑' if npy_val < 0 else '利润持平'
    except (ValueError, TypeError):
        analysis['profit_trend'] = '暂无数据'

    # 营收趋势
    ry = str(fin.get('revenue_yoy', '')).replace('%', '').strip()
    try:
        ry_val = float(ry)
        analysis['revenue_trend'] = '营收增长' if ry_val > 0 else '营收下滑' if ry_val < 0 else '营收持平'
    except (ValueError, TypeError):
        analysis['revenue_trend'] = '暂无数据'

    # 技术面摘要
    tech_parts = []
    if change_60d > 20:
        tech_parts.append('近60日强势上涨')
    elif change_60d < -20:
        tech_parts.append('近60日深度回调')
    elif change_60d > 0:
        tech_parts.append('近60日温和上涨')
    else:
        tech_parts.append('近60日弱势整理')

    if change_ytd > 30:
        tech_parts.append('年内大幅跑赢')
    elif change_ytd < -30:
        tech_parts.append('年内大幅跑输')

    analysis['tech_summary'] = '；'.join(tech_parts) if tech_parts else '技术面无明显特征'

    # 风险等级
    debt_ratio_str = fin.get('debt_ratio', '')
    try:
        debt_ratio = float(debt_ratio_str.replace('%', '').strip())
    except (ValueError, TypeError):
        debt_ratio = 0

    volatility = 0
    if kline_data and len(kline_data) >= 5:
        changes = []
        for i in range(max(0, len(kline_data) - 20), len(kline_data) - 1):
            c = kline_data[i].get('close', 0)
            n = kline_data[i + 1].get('close', 0)
            if c > 0 and n > 0:
                changes.append(abs((n - c) / c))
        if changes:
            volatility = sum(changes) / len(changes) * 100

    risk_score = 0
    risk_reasons = []
    if debt_ratio > 70:
        risk_score += 2; risk_reasons.append(f'资产负债率较高({debt_ratio:.1f}%)')
    elif debt_ratio > 50:
        risk_score += 1
    if turnover > 15:
        risk_score += 2; risk_reasons.append('换手率极高')
    elif turnover > 10:
        risk_score += 1
    if volatility > 5:
        risk_score += 2; risk_reasons.append('波动率大')
    elif volatility > 3:
        risk_score += 1

    if risk_score >= 4:
        analysis['risk_level'] = '高风险'
    elif risk_score >= 2:
        analysis['risk_level'] = '中风险'
    else:
        analysis['risk_level'] = '低风险'

    analysis['risk_reasons'] = risk_reasons
    analysis['volatility'] = round(volatility, 2)

    # AI 综合摘要
    name = signal.get('name', '')
    sentences = []
    sent1 = f"{name}：当前PE处于{analysis['pe_percentile']}区间，{analysis['profit_trend']}，{analysis['revenue_trend']}。"
    sentences.append(sent1)
    sent2 = f"技术面：{analysis['tech_summary']}。风险等级{analysis['risk_level']}。"
    sentences.append(sent2)
    analysis['ai_summary'] = ''.join(sentences)

    return analysis


def _s(val):
    """安全转字符串"""
    if val is None:
        return ''
    try:
        if pd.isna(val):
            return ''
    except (TypeError, ValueError):
        pass
    return str(val)


def process_batch(batch_num, all_codes, all_market_signals):
    """处理一批股票"""
    start_idx = batch_num * BATCH_SIZE
    end_idx = min(start_idx + BATCH_SIZE, len(all_codes))
    batch_codes = all_codes[start_idx:end_idx]

    print(f"\n{'='*60}")
    print(f"批次 {batch_num}: 股票 {start_idx}-{end_idx-1} ({len(batch_codes)}只)")
    print(f"{'='*60}")

    for i, code in enumerate(batch_codes):
        detail_path = os.path.join(DETAILS_DIR, f'{code}.json')

        # 跳过已存在的（但可以强制覆盖）
        if os.path.exists(detail_path):
            # 检查是否有效数据
            try:
                with open(detail_path) as f:
                    existing = json.load(f)
                if existing.get('kline') and len(existing.get('kline', [])) > 50:
                    if i % 50 == 0:
                        print(f"  [{i}/{len(batch_codes)}] {code} 已存在有效数据，跳过")
                    continue
            except:
                pass

        signal = all_market_signals.get(code, {
            'code': code, 'name': '', 'price': 0, 'change_pct': 0,
            'pe': 0, 'pb': 0, 'turnover': 0, 'change_60d': 0, 'change_ytd': 0
        })

        if i % 20 == 0:
            print(f"  [{i}/{len(batch_codes)}] 处理中... {code} {signal.get('name','')}")

        # K线
        kline = fetch_kline(code)
        if not kline:
            kline = []

        # 财务
        financials = fetch_financial_detail(code)

        # 新闻
        news = fetch_news(code)

        # AI分析
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

        # 限速
        time.sleep(0.3)

    # 统计
    count = len([f for f in os.listdir(DETAILS_DIR) if f.endswith('.json')])
    print(f"\n批次 {batch_num} 完成! 当前总计 {count} 只")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=str, required=True, help='批次号(0-11) 或 all')
    args = parser.parse_args()

    print(f"Handly Stock 批量初始化")
    print(f"K线范围: {KLINE_START} ~ {KLINE_END}")
    print(f"输出目录: {DETAILS_DIR}")

    # 获取全市场股票列表
    print("\n获取全市场股票列表...")
    df = ak.stock_zh_a_spot_em()
    all_codes = df['代码'].tolist()
    all_names = df['名称'].tolist()

    # 构建信号索引
    all_market_signals = {}
    for _, row in df.iterrows():
        code = row['代码']
        all_market_signals[code] = {
            'code': code,
            'name': str(row.get('名称', '')),
            'price': float(row.get('最新价', 0) or 0),
            'change_pct': float(row.get('涨跌幅', 0) or 0),
            'pe': float(row.get('市盈率-动态', 0) or 0),
            'pb': float(row.get('市净率', 0) or 0),
            'turnover': float(row.get('换手率', 0) or 0),
            'total_mv': float(row.get('总市值', 0) or 0),
            'change_60d': float(row.get('60日涨跌幅', 0) or 0),
            'change_ytd': float(row.get('年初至今涨跌幅', 0) or 0),
        }

    print(f"全市场: {len(all_codes)} 只")
    existing = len([f for f in os.listdir(DETAILS_DIR) if f.endswith('.json')])
    print(f"已有 detail 文件: {existing} 只")

    if args.batch == 'all':
        total_batches = (len(all_codes) + BATCH_SIZE - 1) // BATCH_SIZE
        for b in range(total_batches):
            process_batch(b, all_codes, all_market_signals)
        print(f"\n全量初始化完成! 共 {len([f for f in os.listdir(DETAILS_DIR) if f.endswith('.json')])} 只")
    else:
        batch_num = int(args.batch)
        process_batch(batch_num, all_codes, all_market_signals)


if __name__ == '__main__':
    main()
