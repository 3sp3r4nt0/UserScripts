#!/usr/bin/env python3
# server.py

import asyncio
import websockets
import sqlite3
import json
import re
from datetime import datetime

DB = 'fofa.db'
clients = {}  # ws -> {type, ...}

def init_db():
    c = sqlite3.connect(DB)
    c.executescript('''
        CREATE TABLE IF NOT EXISTS hosts (
            id INTEGER PRIMARY KEY,
            addr TEXT UNIQUE,
            ip TEXT,
            port TEXT,
            protocol TEXT,
            http_status TEXT,
            title TEXT,
            fid TEXT,
            country TEXT,
            region TEXT,
            city TEXT,
            asn TEXT,
            org TEXT,
            date TEXT,
            product TEXT,
            header TEXT,
            header_hash TEXT,
            banner_hash TEXT,
            search_query TEXT,
            total_results TEXT,
            unique_ips TEXT,
            query_time TEXT,
            search_type TEXT,
            honeypot_excluded TEXT,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS spider_log (
            id INTEGER PRIMARY KEY,
            query TEXT,
            category TEXT,
            name TEXT,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS job_log (
            id INTEGER PRIMARY KEY,
            query TEXT,
            job_idx INTEGER,
            total_jobs INTEGER,
            status TEXT,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY,
            msg TEXT,
            url TEXT,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_addr ON hosts(addr);
        CREATE INDEX IF NOT EXISTS idx_query ON hosts(search_query);
        CREATE INDEX IF NOT EXISTS idx_status ON hosts(http_status);
        CREATE INDEX IF NOT EXISTS idx_protocol ON hosts(protocol);
    ''')
    c.commit()
    c.close()

def detect_protocol_status(data):
    protocol = data.get('protocol', '').lower()
    http_status = data.get('http_status')
    header = data.get('header', '')
    
    if protocol:
        return protocol, None
    if http_status:
        return 'http', http_status
    if header:
        if header.startswith('HTTP/'):
            match = re.match(r'HTTP/[\d.]+\s+(\d{3})', header)
            return 'http', match.group(1) if match else 'unknown'
        elif any(x in header.lower() for x in ['telnet', 'ssh', 'ftp']):
            return 'telnet', None
    port = data.get('port', '')
    if port in ['80', '443', '8080', '8443', '8000', '8888']:
        return 'http', http_status
    return 'other', None

def insert(data):
    c = sqlite3.connect(DB)
    try:
        proto, status = detect_protocol_status(data)
        c.execute('''INSERT OR IGNORE INTO hosts 
            (addr,ip,port,protocol,http_status,title,fid,country,region,city,asn,org,date,product,
             header,header_hash,banner_hash,search_query,total_results,unique_ips,query_time,
             search_type,honeypot_excluded)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (data.get('addr'), data.get('ip'), data.get('port'), proto, status,
             data.get('title'), data.get('fid'), data.get('country'), data.get('region'),
             data.get('city'), data.get('asn'), data.get('org'), data.get('date'),
             data.get('product'), data.get('header'), data.get('header_hash'),
             data.get('banner_hash'), data.get('search_query'), data.get('total_results'),
             data.get('unique_ips'), data.get('query_time'), data.get('search_type'),
             data.get('honeypot_excluded')))
        c.commit()
        new = c.total_changes > 0
    except Exception as e:
        print(f'DB ERR: {e}')
        new = False
    c.close()
    return new, proto, status

def log_spider(query, category, name):
    c = sqlite3.connect(DB)
    c.execute('INSERT INTO spider_log (query,category,name) VALUES (?,?,?)', (query, category, name))
    c.commit()
    c.close()

def log_job(query, job_idx, total_jobs, status):
    c = sqlite3.connect(DB)
    c.execute('INSERT INTO job_log (query,job_idx,total_jobs,status) VALUES (?,?,?,?)', 
              (query, job_idx, total_jobs, status))
    c.commit()
    c.close()

def log_error(msg, url):
    c = sqlite3.connect(DB)
    c.execute('INSERT INTO errors (msg,url) VALUES (?,?)', (msg, url))
    c.commit()
    c.close()

def stats():
    c = sqlite3.connect(DB)
    total = c.execute('SELECT COUNT(*) FROM hosts').fetchone()[0]
    today = c.execute("SELECT COUNT(*) FROM hosts WHERE DATE(ts)=DATE('now')").fetchone()[0]
    http = c.execute("SELECT COUNT(*) FROM hosts WHERE protocol='http'").fetchone()[0]
    telnet = c.execute("SELECT COUNT(*) FROM hosts WHERE protocol='telnet'").fetchone()[0]
    other = c.execute("SELECT COUNT(*) FROM hosts WHERE protocol='other'").fetchone()[0]
    c.close()
    return total, today, http, telnet, other

async def broadcast_to_browsers(message, exclude=None):
    """Broadcast to all browser clients"""
    for ws, info in list(clients.items()):
        if info.get('type') == 'browser' and ws != exclude:
            try:
                await ws.send(message if isinstance(message, str) else json.dumps(message))
            except:
                pass

async def handler(ws):
    clients[ws] = {'type': 'unknown'}
    print(f'+ {datetime.now():%H:%M:%S} client connected ({len(clients)} total)')
    
    try:
        async for msg in ws:
            d = json.loads(msg)
            
            if 'cmd' in d:
                cmd = d['cmd']
                
                if cmd == 'client_ready':
                    clients[ws]['type'] = d.get('type', 'unknown')
                    print(f'  [{clients[ws]["type"]}] ready, jobs: {d.get("jobs", 0)}')
                    
                elif cmd == 'add_jobs':
                    queries = d.get('queries', [])
                    print(f'[API] Adding {len(queries)} jobs')
                    await broadcast_to_browsers({'cmd': 'add_jobs', 'queries': queries}, exclude=ws)
                    await ws.send(json.dumps({'status': 'ok', 'added': len(queries)}))
                    
                elif cmd == 'jobs_added':
                    print(f'[BROWSER] Added {d.get("added")} jobs, total: {d.get("total")}')
                    
                elif cmd == 'clear_jobs':
                    print('[API] Clearing jobs')
                    await broadcast_to_browsers({'cmd': 'clear_jobs'}, exclude=ws)
                    await ws.send(json.dumps({'status': 'ok'}))
                    
                elif cmd == 'get_queue':
                    await broadcast_to_browsers({'cmd': 'get_queue'}, exclude=ws)
                    
                elif cmd == 'queue_status':
                    running = d.get('running', False)
                    count = d.get('count', 0)
                    print(f'[QUEUE] {count} jobs, running: {running}')
                    # Forward to API clients
                    for c, info in clients.items():
                        if info.get('type') != 'browser' and c != ws:
                            try:
                                await c.send(json.dumps(d))
                            except:
                                pass
                    
                elif cmd == 'start_spider':
                    print('[API] Starting spider')
                    await broadcast_to_browsers({'cmd': 'start_spider'}, exclude=ws)
                    await ws.send(json.dumps({'status': 'ok', 'msg': 'start command sent'}))
                    
                elif cmd == 'stop_spider':
                    print('[API] Stopping spider')
                    await broadcast_to_browsers({'cmd': 'stop_spider'}, exclude=ws)
                    await ws.send(json.dumps({'status': 'ok'}))
                    
                elif cmd == 'batch_start':
                    print(f'[BATCH] Starting {d.get("total")} jobs')
                    
                elif cmd == 'batch_done':
                    print(f'[BATCH] Complete: {d.get("processed")} jobs')
                    
                elif cmd == 'job_start':
                    query = d.get('query', '')[:50]
                    print(f'[JOB {d.get("idx")}/{d.get("total")}] {query}')
                    log_job(d.get('query',''), d.get('idx',0), d.get('total',0), 'start')
                    
                elif cmd == 'spider_start':
                    print(f'[SPIDER] {d.get("links")} links')
                    
                elif cmd == 'spider_link':
                    print(f'  [{d.get("idx")}] {d.get("category")}: {d.get("name")[:30]}')
                    log_spider(d.get('query',''), d.get('category',''), d.get('name',''))
                    
                elif cmd == 'spider_done':
                    print(f'[SPIDER] Done: {d.get("processed")} processed')
                    log_job(d.get('query',''), 0, 0, 'done')
                    
                elif cmd == 'error':
                    print(f'[ERROR] {d.get("msg")}')
                    log_error(d.get('msg',''), d.get('url',''))
                    
                continue
            
            # Data insert
            new, proto, status = insert(d)
            total, today, http, telnet, other = stats()
            
            status_str = f'[{proto.upper()}:{status or "-"}]' if proto else ''
            result = f"{'NEW' if new else 'DUP'} {status_str}: {d.get('addr')}"
            stats_str = f"T:{total} D:{today} H:{http} T:{telnet} O:{other}"
            
            print(f'{result} | {stats_str}')
            await ws.send(f'{result} | {stats_str}')
            
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f'Handler ERR: {e}')
    finally:
        del clients[ws]
        print(f'- {datetime.now():%H:%M:%S} disconnected ({len(clients)} total)')

async def main():
    init_db()
    print('=' * 50)
    print('FOFA Spider Server')
    print('=' * 50)
    print(f'WebSocket: ws://127.0.0.1:8765')
    print('Waiting for connections...')
    print('=' * 50)
    async with websockets.serve(handler, '127.0.0.1', 8765):
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())