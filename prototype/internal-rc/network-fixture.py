"""Isolated test transport only: fetch real owned WP bytes through a loopback bridge.
Product scanner is unchanged. No external DNS, public request or prebuilt report.
"""
import sys,json,urllib.request,socket
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'public-audit'))
from product_source import build_snapshot
from product_api import save_report
from scanner import ScanError
config=json.load(sys.stdin)
assert config['url'] in ['https://rc-source.example/bolt/','https://rc-source.example/growth-os/']
bridge=urlsplit(config['bridge']);assert bridge.scheme=='http' and bridge.hostname=='127.0.0.1'
real_connect=socket.create_connection

def connect(address,*args,**kwargs):
    if address!=('127.0.0.1',bridge.port):raise AssertionError('Unapproved fixture network target')
    return real_connect(address,*args,**kwargs)

def fetch(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.netloc!='rc-source.example' or u.path not in ['/robots.txt',urlsplit(config['url']).path] or u.query:raise ScanError('private_target','Unapproved fixture source')
    with urllib.request.urlopen(config['bridge']+u.path,timeout=5) as r:
        return r.status,{k.lower():v for k,v in r.headers.items()},r.read(1_000_001)
with patch.object(socket,'create_connection',connect):
    report=build_snapshot(config['url'],fetch)
    if config.get('database'):report=save_report(config['database'],report)
    print(json.dumps(report,ensure_ascii=False))
