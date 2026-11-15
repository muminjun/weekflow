"""Transfer the just-created OAuth secret directly from the authorized Cloud tab to Supabase."""
import json,runpy,time
browser=runpy.run_path('scripts/browser-admin.py')['execute']
ctx=runpy.run_path('scripts/manage-supabase.py');request=ctx['request'];ref=ctx['REF']
for attempt in range(20):
 raw=browser('cloud',"JSON.stringify({id:(document.body.innerText.match(/[0-9]+-[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com/)||[])[0],secret:(document.body.innerText.match(/GOCSPX-[a-zA-Z0-9_-]+/)||[])[0]})")
 data=json.loads(raw)
 if data.get('id') and data.get('secret'):
  request(f'projects/{ref}/config/auth',{'external_google_enabled':True,'external_google_client_id':data['id'],'external_google_secret':data['secret'],'external_anonymous_users_enabled':False,'external_email_enabled':False},'PATCH')
  print('Google OAuth client created and its private secret transferred directly to Supabase. No credential values printed or saved.')
  break
 time.sleep(1)
else:raise SystemExit('OAuth creation dialog not ready or private secret not visible. No credential values printed.')
