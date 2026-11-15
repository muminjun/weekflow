"""Provision server-only random keys without writing private values to disk or logs."""
import json,runpy,secrets,subprocess,sys
from pathlib import Path
ctx=runpy.run_path('scripts/manage-supabase.py');request=ctx['request'];REF=ctx['REF']
existing=request(f'projects/{REF}/secrets',method='GET')
if any(s.get('name')=='VAPID_PRIVATE_KEY' for s in existing) and '--rotate-keys' not in sys.argv:
 raise SystemExit('Already provisioned. Refusing to rotate keys and invalidate device subscriptions. Use --rotate-keys only after planning a device re-subscription.')
keys=json.loads(subprocess.run(['node','--input-type=module','-e',"import {generateKeyPairSync} from 'node:crypto';const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const pub=publicKey.export({format:'jwk'}),priv=privateKey.export({format:'jwk'});console.log(JSON.stringify({publicKey:Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]).toString('base64url'),privateKey:priv.d}));"],capture_output=True,text=True,check=True).stdout)
cron_secret=secrets.token_urlsafe(48)
request(f'projects/{REF}/secrets',[{'name':'VAPID_PUBLIC_KEY','value':keys['publicKey']},{'name':'VAPID_PRIVATE_KEY','value':keys['privateKey']},{'name':'CRON_SECRET','value':cron_secret}])
p=Path('.env.local');lines=[s for s in p.read_text().splitlines() if not s.startswith('VITE_VAPID_PUBLIC_KEY=')];lines.append('VITE_VAPID_PUBLIC_KEY='+keys['publicKey']);p.write_text('\n'.join(lines)+'\n')
for line in lines:
 name,_,value=line.partition('=')
 if name.startswith('VITE_'):subprocess.run(['gh','variable','set',name,'--repo','muminjun/weekflow','--body',value],check=True,capture_output=True)
query="""create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;
select vault.create_secret('%s','weekflow_cron_secret');
select cron.schedule('weekflow-notifications','*/5 * * * *',$job$select net.http_post(url:='https://%s.supabase.co/functions/v1/dispatch-push',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='weekflow_cron_secret' order by created_at desc limit 1)),body:='{}'::jsonb);$job$);"""%(cron_secret,REF)
request(f'projects/{REF}/database/query',{'query':query})
print('VAPID server secrets, public GitHub variables and 5-minute Vault-authenticated Cron provisioned.')
