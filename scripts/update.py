#!/usr/bin/env python3
"""Handly Stock — 每日数据更新入口 (GitHub Actions)"""
import json, os, sys, time
from datetime import datetime

# Add scripts/ to path for importing pipeline
sys.path.insert(0, os.path.dirname(__file__))
from pipeline import run_pipeline

start = time.time()
now = datetime.now()

# 周末跳过
if now.weekday() >= 5:
    print(f"周末，跳过更新")
    sys.exit(0)

print(f"=== Handly Stock 每日更新 {now.strftime('%Y-%m-%d %H:%M:%S')} ===")

# 跑 pipeline (输出到 js/ 目录)
output = run_pipeline()

# 生成 data.js
signals_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'signals.json')
data_js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'data.js')

with open(signals_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

js = f'window.SIGNALS_DATA = {json.dumps(data, ensure_ascii=False)};'
with open(data_js_path, 'w', encoding='utf-8') as f:
    f.write(js)

elapsed = time.time() - start
print(f"完成! {elapsed:.1f}s | data.js: {len(js)//1024}KB | signals.json: {os.path.getsize(signals_path)//1024}KB")
