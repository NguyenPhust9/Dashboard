#!/bin/sh
set -eu
umask 077
# flock is held for the lifetime of supervisord; no other instance sharing this
# volume may start readers. A previous container's PID may now belong to Xvfb.
if [ "$AMIS_CRM_BROWSER_PROFILE" != "/var/lib/amis-crm/profile" ]; then
  echo 'Unexpected CRM profile location.' >&2
  exit 1
fi
rm -f -- /var/lib/amis-crm/profile/bikeforce-script.lock
exec supervisord -n -c /app/deploy/crm-worker/supervisord.conf
