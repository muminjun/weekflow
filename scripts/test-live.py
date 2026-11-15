"""Destructive only to two freshly-created test users; passwords/keys remain in memory."""
import json,runpy,secrets,urllib.request,urllib.error,uuid,time,sys,subprocess
ctx=runpy.run_path('scripts/manage-supabase.py');manage=ctx['request'];ref=ctx['REF'];root=f'https://{ref}.supabase.co'
keys=manage(f'projects/{ref}/api-keys');anon=next(k['api_key'] for k in keys if k['name']=='anon');service=next(k['api_key'] for k in keys if k['name']=='service_role')
def api(path,data=None,token=None,method=None):
 req=urllib.request.Request(root+path,data=json.dumps(data).encode() if data is not None else None,headers={'apikey':anon if token!=service else service,'Authorization':'Bearer '+(token or anon),'Content-Type':'application/json'},method=method)
 try:
  with urllib.request.urlopen(req,timeout=45) as r:
   body=r.read();return r.status,json.loads(body) if body else None
 except urllib.error.HTTPError as e:
  body=e.read()
  try:result=json.loads(body)
  except:result={'error':'non-json response'}
  return e.code,result
users=[];checks=[]
def check(name,value):
 if not value:raise AssertionError(name)
 checks.append(name);print('PASS',name)
def rpc(name,args,token):return api('/rest/v1/rpc/'+name,args,token)
try:
 manage(f'projects/{ref}/config/auth',{'external_email_enabled':True},'PATCH')
 sessions=[]
 for suffix in ('a','b'):
  email=f'weekflow-qa-{uuid.uuid4().hex}-{suffix}@example.com';password=secrets.token_urlsafe(32)
  status,user=api('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},service)
  check('create isolated test user '+suffix,status==200)
  users.append(user['id'])
  for attempt in range(20):
   status,session=api('/auth/v1/token?grant_type=password',{'email':email,'password':password})
   if status==200:break
   time.sleep(2)
  check('real Auth session '+suffix,status==200 and bool(session.get('access_token')))
  sessions.append(session['access_token']);
  if suffix=='a':browser_session=session
  check('ensure profile '+suffix,rpc('ensure_profile',{},sessions[-1])[0]==204)
 a,b=sessions;task_id=str(uuid.uuid4());mid=str(uuid.uuid4());changes=[{'table':'tasks','action':'insert','row':{'id':task_id,'title':'Live RLS test'}}]
 check('atomic task creation',rpc('apply_changes',{'p_mutation_id':mid,'p_changes':changes,'p_acknowledge':False},a)[0]==200)
 check('idempotent replay',rpc('apply_changes',{'p_mutation_id':mid,'p_changes':changes,'p_acknowledge':False},a)[0]==200)
 status,result=api('/rest/v1/tasks?id=eq.'+task_id,token=b);check('B cannot read A task',status==200 and result==[])
 status,result=api('/rest/v1/tasks?id=eq.'+task_id,token=a);check('A reads exactly one persisted task',status==200 and len(result)==1)
 status,result=rpc('apply_changes',{'p_mutation_id':str(uuid.uuid4()),'p_changes':[{'table':'tasks','action':'update','expected_version':1,'row':{'id':task_id,'title':'forged'}}],'p_acknowledge':False},b);check('B cannot mutate A UUID',status>=400 and 'FORBIDDEN' in json.dumps(result))
 status,result=rpc('apply_changes',{'p_mutation_id':str(uuid.uuid4()),'p_changes':[{'table':'tasks','action':'update','expected_version':999,'row':{'id':task_id,'title':'conflict'}}],'p_acknowledge':False},a);check('real server version conflict',status>=400 and 'VERSION_CONFLICT' in json.dumps(result))
 status,result=api('/rest/v1/tasks');check('anonymous private table rejected',status>=400)
 status,result=rpc('read_dataset',{},a);check('full owned dataset',status==200 and len(result['tasks'])==1)
 backup={'schemaVersion':1,'app':'WEEKFLOW','exportedAt':'2026-11-15T00:00:00Z','timezone':'Asia/Seoul','data':{k:v for k,v in result.items() if k!='in_app_notifications'}}
 status,result=rpc('import_backup',{'p_backup':backup,'p_mode':'merge','p_confirm':'MERGE'},b);
 if status!=200:print('Import failure:',status,result)
 check('cross-account backup import remaps IDs transactionally',status==200)
 status,result=api('/rest/v1/tasks',token=b);check('B receives remapped task',status==200 and len(result)==1 and result[0]['id']!=task_id and result[0]['user_id']==users[1])
 status,result=api('/functions/v1/dispatch-push',{});check('Cron rejects missing private secret',status in (401,403))
 status,result=api('/functions/v1/push-subscription',{'action':'test'},a);check('authenticated Push endpoint refuses missing real subscription',status==400 and result.get('error')=='NO_SUBSCRIPTION')
 status,result=api('/functions/v1/delete-account',{'confirm':'DELETE'});check('account deletion rejects anonymous caller',status==401)
 if '--browser' in sys.argv:
  subprocess.run(['node','scripts/test-live-browser.mjs'],input=json.dumps({'url':root,'key':anon,'session':browser_session}),text=True,check=True)
 print('LIVE CHECKS:',len(checks),'passed. Google OAuth and physical Push delivery are not tested here.')
finally:
 for user in users:
  code,_=api('/auth/v1/admin/users/'+user,token=service,method='DELETE');print('Test user cleanup:',code)
 manage(f'projects/{ref}/config/auth',{'external_email_enabled':False},'PATCH')
 print('Email provider disabled; product uses Google OAuth only.')
