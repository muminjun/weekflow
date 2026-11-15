"""Owner-only deployment helper. Credentials stay in process memory; never print responses with keys."""
import json, os, subprocess, sys, urllib.request
from pathlib import Path
REF='emhmmorcpamlenqxwmaw'
token=os.getenv('SUPABASE_ACCESS_TOKEN') or subprocess.run(['security','find-generic-password','-s','Supabase CLI','-w'],capture_output=True,text=True,check=True).stdout.strip()
# CLI keychain stores raw access token on this machine.
if token.startswith('go-keyring-base64:'):
 import base64
 token=base64.b64decode(token.split(':',1)[1]).decode()
def request(path,data=None,method=None):
 req=urllib.request.Request('https://api.supabase.com/v1/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
 with urllib.request.urlopen(req,timeout=120) as r:
  body=r.read()
  return json.loads(body) if body else None
action=sys.argv[1] if len(sys.argv)>1 else ''
if action=='migrate':
 request(f'projects/{REF}/database/query',{'query':'create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);'})
 for p in ([Path('supabase/migrations')/f for f in sys.argv[2:]] if len(sys.argv)>2 else sorted(Path('supabase/migrations').glob('*.sql'))):
  version=p.stem.split('_')[0]
  if not version.isdigit():raise ValueError('Invalid migration filename')
  existing=request(f'projects/{REF}/database/query',{'query':f"select version from supabase_migrations.schema_migrations where version='{version}'"})
  if existing:print(p.name,'already applied');continue
  name=p.stem.replace("'","''")
  request(f'projects/{REF}/database/query',{'query':"begin;\n"+p.read_text()+f"\ninsert into supabase_migrations.schema_migrations(version,name) values('{version}','{name}');\ncommit;"});print(p.name,'applied')
elif action=='query':
 result=request(f'projects/{REF}/database/query',{'query':sys.stdin.read()});print(json.dumps(result))
elif action=='configure':
 keys=request(f'projects/{REF}/api-keys')
 public=next(k['api_key'] for k in keys if k['name']=='anon')
 Path('.env.local').write_text(f'VITE_SUPABASE_URL=https://{REF}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY={public}\nVITE_BASE_PATH=/weekflow/\n')
 request(f'projects/{REF}/config/auth',{'site_url':'https://muminjun.github.io/weekflow/','uri_allow_list':'http://127.0.0.1:5173/weekflow/,http://localhost:5173/weekflow/,https://muminjun.github.io/weekflow/','disable_signup':False,'external_anonymous_users_enabled':False},'PATCH')
 print('Public environment and exact OAuth redirects configured; Google provider still needs client credentials.')
