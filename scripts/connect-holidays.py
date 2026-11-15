"""Use the account owner's existing approved KASI key; never write it to source or output."""
import os,runpy,subprocess
browser=runpy.run_path('scripts/browser-admin.py')['execute']
key=browser('portal_app',"document.getElementById('ServiceKey').value")
if not key or len(key)<20 or key=='WORK_TAB_NOT_FOUND':raise SystemExit('Approved service key is not available in the selected application.')
subprocess.run(['gh','secret','set','KASI_SERVICE_KEY','--repo','muminjun/weekflow'],input=key,text=True,check=True,capture_output=True)
print('Existing approved KASI key saved to GitHub Actions Secret; no key value printed.')
subprocess.run(['npm','run','holidays'],env={**os.environ,'KASI_SERVICE_KEY':key},check=True)
