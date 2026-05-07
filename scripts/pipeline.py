"""
Handly Stock — 数据管道
抓取 A 股全市场数据，输出结构化 JSON
数据源：akshare（东方财富接口）
"""

import akshare as ak
import pandas as pd
import json
import os
from datetime import datetime, timedelta

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'js')


def fetch_all_market():
    """获取全A股实时行情"""
    print("[1/5] 获取全市场行情...")
    df = ak.stock_zh_a_spot_em()
    df = df.rename(columns={
        '代码': 'code', '名称': 'name', '最新价': 'price', '涨跌幅': 'change_pct',
        '涨跌额': 'change_amt', '成交量': 'volume', '成交额': 'amount',
        '振幅': 'amplitude', '最高': 'high', '最低': 'low', '今开': 'open',
        '昨收': 'pre_close', '量比': 'volume_ratio', '换手率': 'turnover',
        '市盈率-动态': 'pe_dynamic', '市净率': 'pb',
        '总市值': 'total_mv', '流通市值': 'circulating_mv',
        '60日涨跌幅': 'change_60d', '年初至今涨跌幅': 'change_ytd'
    })
    # 只保留有用列
    cols = ['code', 'name', 'price', 'change_pct', 'change_amt', 'volume', 'amount',
            'amplitude', 'high', 'low', 'open', 'pre_close', 'volume_ratio',
            'turnover', 'pe_dynamic', 'pb', 'total_mv', 'circulating_mv',
            'change_60d', 'change_ytd']
    df = df[[c for c in cols if c in df.columns]]
    return df


def fetch_limit_up():
    """获取今日涨停板"""
    print("[2/5] 获取涨停板...")
    today = datetime.now().strftime('%Y%m%d')
    df = ak.stock_zt_pool_em(date=today)
    df = df.rename(columns={
        '代码': 'code', '名称': 'name', '最新价': 'price', '涨跌幅': 'change_pct',
        '成交额': 'amount', '流通市值': 'circulating_mv', '总市值': 'total_mv',
        '换手率': 'turnover', '封板资金': 'lock_amount',
        '首次封板时间': 'first_lock_time', '最后封板时间': 'last_lock_time',
        '炸板次数': 'break_times', '涨停统计': 'limit_stats', '连板数': 'board_count',
        '所属行业': 'industry'
    })
    cols = ['code', 'name', 'price', 'change_pct', 'amount', 'circulating_mv',
            'total_mv', 'turnover', 'lock_amount', 'first_lock_time',
            'last_lock_time', 'break_times', 'limit_stats', 'board_count', 'industry']
    df = df[[c for c in cols if c in df.columns]]
    return df


def fetch_fund_flow(stock_codes, market_map=None):
    """批量获取个股资金流向（最近N天）"""
    print("[3/5] 获取资金流向...")
    if market_map is None:
        market_map = {}

    results = []
    total = len(stock_codes)
    for i, code in enumerate(stock_codes):
        if i % 50 == 0:
            print(f"  资金流向进度: {i}/{total}")
        try:
            market = market_map.get(code, 'sz' if code.startswith('0') or code.startswith('3') else 'sh')
            df = ak.stock_individual_fund_flow(stock=code, market=market)
            if len(df) > 0:
                latest = df.iloc[-1].to_dict()
                latest['code'] = code
                results.append(latest)
        except Exception:
            pass  # 科创板/北交所代码可能查不到
    print(f"  资金流向: 获取了 {len(results)} 条")
    return pd.DataFrame(results)


def fetch_lhb():
    """获取最新龙虎榜"""
    print("[4/5] 获取龙虎榜...")
    dates = []
    d = datetime.now()
    for i in range(5):
        test_date = (d - timedelta(days=i)).strftime('%Y%m%d')
        try:
            df = ak.stock_lhb_detail_em(date=test_date)
            if len(df) > 0:
                dates.append(test_date)
        except Exception:
            pass

    if not dates:
        return pd.DataFrame()

    all_dfs = []
    for date in dates[:3]:  # 最多取最近3天
        try:
            df = ak.stock_lhb_detail_em(date=date)
            df['lhb_date'] = date
            all_dfs.append(df)
        except Exception:
            pass

    if not all_dfs:
        return pd.DataFrame()

    df = pd.concat(all_dfs, ignore_index=True)
    df = df.rename(columns={
        '代码': 'code', '名称': 'name', '收盘价': 'close',
        '涨跌幅': 'change_pct', '龙虎榜净买额': 'lhb_net',
        '龙虎榜买入额': 'lhb_buy', '龙虎榜卖出额': 'lhb_sell',
        '龙虎榜成交额': 'lhb_amount', '市场总成交额': 'market_amount',
        '净买额占总成交比': 'lhb_ratio', '上榜原因': 'reason'
    })
    return df


def fetch_financials(code):
    """获取个股财务摘要"""
    try:
        df = ak.stock_financial_abstract_ths(symbol=code, indicator='按报告期')
        if len(df) == 0:
            return {}
        latest = df.iloc[-1]
        return {
            'net_profit': str(latest.get('净利润', '')),
            'net_profit_yoy': str(latest.get('净利润同比增长率', '')),
            'revenue': str(latest.get('营业总收入', '')),
            'revenue_yoy': str(latest.get('营业总收入同比增长率', '')),
            'eps': str(latest.get('基本每股收益', '')),
            'roe': str(latest.get('净资产收益率', '')),
            'net_margin': str(latest.get('销售净利率', '')),
            'debt_ratio': str(latest.get('资产负债率', '')),
            'report_period': str(latest.get('报告期', ''))
        }
    except Exception:
        return {}


def compute_signals(all_market, limit_up, fund_flow, lhb):
    """
    信号引擎：综合评分选股 + 买卖点推荐
    返回每只股票的信号详情
    """
    print("[5/5] 计算买卖信号...")

    signals = []

    # 建立辅助索引
    limit_up_codes = set(limit_up['code'].tolist()) if len(limit_up) > 0 else set()
    fund_flow_map = {}
    if len(fund_flow) > 0 and 'code' in fund_flow.columns:
        for _, row in fund_flow.iterrows():
            fund_flow_map[row['code']] = row.to_dict()
    lhb_map = {}
    if len(lhb) > 0 and 'code' in lhb.columns:
        for _, row in lhb.iterrows():
            code = row['code']
            if code not in lhb_map:
                lhb_map[code] = row.to_dict()

    for _, stock in all_market.iterrows():
        code = stock['code']
        signal = {
            'code': code,
            'name': stock.get('name', ''),
            'price': float(stock.get('price', 0) or 0),
            'change_pct': float(stock.get('change_pct', 0) or 0),
            'pe': float(stock.get('pe_dynamic', 0) or 0),
            'pb': float(stock.get('pb', 0) or 0),
            'total_mv': float(stock.get('total_mv', 0) or 0),
            'turnover': float(stock.get('turnover', 0) or 0),
            'amount': float(stock.get('amount', 0) or 0),
            'change_60d': float(stock.get('change_60d', 0) or 0),
            'change_ytd': float(stock.get('change_ytd', 0) or 0),
        }

        score = 0
        reasons = []

        # --- 1. 涨停板信号（权重最高） ---
        if code in limit_up_codes:
            lt = limit_up[limit_up['code'] == code].iloc[0]
            board_count = int(lt.get('board_count', 1) or 1)
            break_times = int(lt.get('break_times', 0) or 0)
            lock_amount = float(lt.get('lock_amount', 0) or 0)
            first_lock = str(lt.get('first_lock_time', '')).strip()

            # 首板 + 快速封板 + 不炸板 = 强信号
            if board_count == 1:
                score += 20
                reasons.append('首板涨停')
            elif board_count == 2:
                score += 30
                reasons.append('二连板')
            elif board_count >= 3:
                score += 15
                reasons.append(f'{board_count}连板(高位注意风险)')

            if break_times == 0:
                score += 10
                reasons.append('封板零炸板')
            elif break_times <= 2:
                score += 5

            # 早盘封板加分
            if first_lock and first_lock <= '093500':
                score += 10
                reasons.append('开盘秒板')

            signal['board_count'] = board_count
            signal['break_times'] = break_times
            signal['first_lock_time'] = first_lock
            signal['lock_amount'] = lock_amount
        else:
            signal['board_count'] = 0

        # --- 2. 资金流向信号 ---
        if code in fund_flow_map:
            ff = fund_flow_map[code]
            main_net = float(ff.get('主力净流入-净额', 0) or 0)
            main_pct = float(ff.get('主力净流入-净占比', 0) or 0)

            if main_net > 100000000:  # 主力净流入 > 1亿
                score += 15
                reasons.append(f'主力净流入{main_net/1e8:.1f}亿')
            elif main_net > 50000000:
                score += 10
            elif main_net < -50000000:
                score -= 5

            signal['main_net_inflow'] = main_net
            signal['main_net_pct'] = main_pct

        # --- 3. 龙虎榜信号 ---
        if code in lhb_map:
            lh = lhb_map[code]
            lhb_net = float(lh.get('lhb_net', 0) or 0)
            if lhb_net > 50000000:
                score += 15
                reasons.append(f'龙虎榜净买{int(lhb_net/1e4)}万')
            elif lhb_net > 0:
                score += 8
            signal['lhb_net'] = lhb_net
            signal['lhb_reason'] = str(lh.get('reason', ''))

        # --- 4. 技术面信号 ---
        change = signal['change_pct']
        turnover = signal['turnover']
        amount = signal['amount']

        # 放量上涨
        if change > 3 and turnover > 5:
            score += 8
            reasons.append('放量上涨')
        elif change > 5 and turnover > 3:
            score += 5
            reasons.append('强势拉升')

        # 底部反转（60日跌 + 今日涨）
        if signal['change_60d'] < -20 and change > 3:
            score += 5
            reasons.append('底部放量反弹')

        # --- 5. 估值信号 ---
        pe = signal['pe']
        pb = signal['pb']
        if 0 < pe < 20:
            score += 5
            reasons.append(f'低PE({pe:.1f})')
        elif 0 < pe < 40:
            score += 2

        if 0 < pb < 1.5:
            score += 3
            reasons.append(f'破净/低PB({pb:.2f})')

        # --- 计算买卖点 ---
        price = signal['price']
        if price > 0:
            # 买入参考位：基于信号强度
            if score >= 40:
                signal['buy_zone'] = round(price * 0.97, 2)
                signal['buy_zone_high'] = round(price * 1.01, 2)
                signal['action'] = 'strong_buy'
            elif score >= 25:
                signal['buy_zone'] = round(price * 0.95, 2)
                signal['buy_zone_high'] = round(price * 1.00, 2)
                signal['action'] = 'buy'
            elif score >= 10:
                signal['buy_zone'] = round(price * 0.93, 2)
                signal['buy_zone_high'] = round(price * 0.98, 2)
                signal['action'] = 'watch'
            else:
                signal['action'] = 'hold'

            # 止盈/止损参考
            signal['take_profit'] = round(price * 1.15, 2)
            signal['stop_loss'] = round(price * 0.92, 2)
        else:
            signal['action'] = 'halted'
            signal['buy_zone'] = 0
            signal['buy_zone_high'] = 0
            signal['take_profit'] = 0
            signal['stop_loss'] = 0

        signal['score'] = score
        signal['reasons'] = reasons
        signals.append(signal)

    # 按评分排序
    signals.sort(key=lambda x: x['score'], reverse=True)
    return signals


def run_pipeline():
    """执行完整数据管道"""
    start = datetime.now()
    print(f"=== Handly Stock Pipeline 启动 {start.strftime('%Y-%m-%d %H:%M:%S')} ===")

    # 1. 全市场行情
    all_market = fetch_all_market()

    # 2. 涨停板
    limit_up = fetch_limit_up()

    # 3. 龙虎榜
    lhb = fetch_lhb()

    # 4. 资金流向（只查涨停股+龙虎榜股，减少请求量）
    focus_codes = set()
    if len(limit_up) > 0:
        focus_codes.update(limit_up['code'].tolist())
    if len(lhb) > 0:
        focus_codes.update(lhb['code'].tolist())

    fund_flow_data = fetch_fund_flow(list(focus_codes)[:100])

    # 5. 信号计算
    signals = compute_signals(all_market, limit_up, fund_flow_data, lhb)

    # 6. 输出 JSON
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output = {
        'update_time': start.strftime('%Y-%m-%d %H:%M:%S'),
        'total_stocks': len(all_market),
        'limit_up_count': len(limit_up),
        'lhb_count': len(lhb),
        'strong_buy': [s for s in signals if s['action'] == 'strong_buy'],
        'buy': [s for s in signals if s['action'] == 'buy'],
        'watch': [s for s in signals if s['action'] == 'watch'][:100],  # 只保留前100
        'top_signals': signals[:50],  # 综合排名前50
        'limit_up_list': limit_up.to_dict('records') if len(limit_up) > 0 else [],
    }

    with open(os.path.join(OUTPUT_DIR, 'signals.json'), 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n=== 完成! 耗时 {elapsed:.1f}s ===")
    print(f"  全市场: {len(all_market)} 只")
    print(f"  涨停板: {len(limit_up)} 只")
    print(f"  龙虎榜: {len(lhb)} 条")
    print(f"  信号: strong_buy={len(output['strong_buy'])}, buy={len(output['buy'])}, watch={len(output['watch'])}")

    return output


if __name__ == '__main__':
    run_pipeline()
