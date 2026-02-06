#!/usr/bin/env python3
# add_jobs.py

import asyncio
import websockets
import json
import sys
import os

WS_URL = 'ws://127.0.0.1:8765'

os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'

async def send_command(cmd, data=None, wait_response=True):
    try:
        async with websockets.connect(WS_URL, ping_interval=None, close_timeout=5) as ws:
            msg = {'cmd': cmd}
            if data:
                msg.update(data)
            await ws.send(json.dumps(msg))
            if wait_response:
                response = await asyncio.wait_for(ws.recv(), timeout=10)
                return json.loads(response)
            return {'status': 'sent'}
    except asyncio.TimeoutError:
        print('[!] Timeout')
        return None
    except ConnectionRefusedError:
        print('[!] Cannot connect. Is server.py running?')
        return None
    except Exception as e:
        print(f'[!] Error: {e}')
        return None

async def add_jobs(queries):
    result = await send_command('add_jobs', {'queries': queries})
    if result:
        print(f'[+] Added {result.get("added", 0)} jobs')
    return result

async def start_spider():
    result = await send_command('start_spider')
    if result:
        print(f'[+] Spider start command sent')
    return result

async def stop_spider():
    result = await send_command('stop_spider')
    if result:
        print(f'[+] Spider stop command sent')
    return result

async def clear_jobs():
    result = await send_command('clear_jobs')
    if result:
        print(f'[+] Queue cleared')
    return result

async def get_status():
    result = await send_command('get_queue')
    if result:
        print(f'[+] Status request sent (check browser)')
    return result

async def add_and_start(queries):
    result = await send_command('add_jobs', {'queries': queries})
    if result and result.get('status') == 'ok':
        print(f'[+] Added {result.get("added", 0)} jobs')
        await asyncio.sleep(1)
        await start_spider()
    return result

def main():
    if len(sys.argv) < 2:
        print('FOFA Spider CLI')
        print('=' * 40)
        print('Commands:')
        print('  add <query> [query2...]  Add queries to queue')
        print('  file <path>              Add queries from file')
        print('  start                    Start spider')
        print('  stop                     Stop spider')
        print('  clear                    Clear job queue')
        print('  status                   Get queue status')
        print('  run <query> [query2...]  Add and start immediately')
        print('  runfile <path>           Add from file and start')
        print()
        print('Examples:')
        print('  python add_jobs.py add "iqinvision"')
        print('  python add_jobs.py run "port=\\"3389\\""')
        print('  python add_jobs.py file queries.txt')
        print('  python add_jobs.py runfile queries.txt')
        sys.exit(0)
    
    cmd = sys.argv[1]
    
    if cmd == 'add':
        if len(sys.argv) < 3:
            print('[!] No queries provided')
            sys.exit(1)
        asyncio.run(add_jobs(sys.argv[2:]))
        
    elif cmd == 'file':
        if len(sys.argv) < 3:
            print('[!] No file specified')
            sys.exit(1)
        try:
            with open(sys.argv[2], 'r', encoding='utf-8') as f:
                queries = [l.strip() for l in f if l.strip() and not l.startswith('#')]
            print(f'[*] Loading {len(queries)} queries from file')
            asyncio.run(add_jobs(queries))
        except FileNotFoundError:
            print(f'[!] File not found: {sys.argv[2]}')
            sys.exit(1)
            
    elif cmd == 'run':
        if len(sys.argv) < 3:
            print('[!] No queries provided')
            sys.exit(1)
        asyncio.run(add_and_start(sys.argv[2:]))
        
    elif cmd == 'runfile':
        if len(sys.argv) < 3:
            print('[!] No file specified')
            sys.exit(1)
        try:
            with open(sys.argv[2], 'r', encoding='utf-8') as f:
                queries = [l.strip() for l in f if l.strip() and not l.startswith('#')]
            print(f'[*] Loading {len(queries)} queries from file')
            asyncio.run(add_and_start(queries))
        except FileNotFoundError:
            print(f'[!] File not found: {sys.argv[2]}')
            sys.exit(1)
            
    elif cmd == 'start':
        asyncio.run(start_spider())
        
    elif cmd == 'stop':
        asyncio.run(stop_spider())
        
    elif cmd == 'clear':
        asyncio.run(clear_jobs())
        
    elif cmd == 'status':
        asyncio.run(get_status())
        
    else:
        print(f'[!] Unknown command: {cmd}')
        sys.exit(1)

if __name__ == '__main__':
    main()