"""Apply the Vault-backed scheduler without rotating any device keys or secrets."""
import runpy
from pathlib import Path

ctx = runpy.run_path('scripts/manage-supabase.py')
ctx['request'](f"projects/{ctx['REF']}/database/query", {
    'query': Path('supabase/cron.sql').read_text(),
})
print('5-minute Cron configured with a 120-second HTTP timeout; secrets unchanged.')
