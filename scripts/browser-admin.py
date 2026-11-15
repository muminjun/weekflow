"""Run owner-authorized setup in the task's Chrome tabs; never print OAuth secrets."""
import json,re,subprocess,sys
SCOPES={'cloud':'console.cloud.google.com/','portal_app':'data.go.kr/iim/','portal':'data.go.kr/','google_login':'accounts.google.com/','app':'muminjun.github.io/weekflow/'}
def execute(scope,javascript):
 fragment=SCOPES[scope]
 def quote(s):return s.replace('\\','\\\\').replace('"','\\"').replace('\n','\\n').replace('\r','')
 script='''tell application "Google Chrome"
repeat with w in windows
repeat with t in tabs of w
if URL of t contains "%s" then
return execute t javascript "%s"
end if
end repeat
end repeat
return "WORK_TAB_NOT_FOUND"
end tell'''%(fragment,quote(javascript))
 p=subprocess.run(['osascript','-'],input=script,text=True,capture_output=True,check=True)
 return p.stdout.strip()
if __name__=='__main__':
 output=execute(sys.argv[1],sys.stdin.read())
 output=re.sub(r'GOCSPX-[\w-]+','[REDACTED_OAUTH_SECRET]',output)
 output=re.sub(r'ya29\.[\w.-]+','[REDACTED_ACCESS_TOKEN]',output)
 print(output)
