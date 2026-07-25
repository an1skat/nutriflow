# NutriFlow operations

## Backend suite with an isolated MongoDB

The backend uses MongoDB transactions, so the isolated test server must be a replica set.
Start a single-node server without Docker:

```bash
TEST_MONGO_DIR="${TMPDIR%/}/nutriflow-mongo-test"
mkdir -p "$TEST_MONGO_DIR"
mongod \
  --dbpath "$TEST_MONGO_DIR" \
  --port 27018 \
  --bind_ip 127.0.0.1 \
  --replSet rs0 \
  --logpath "$TEST_MONGO_DIR/mongod.log" \
  --pidfilepath "$TEST_MONGO_DIR/mongod.pid" \
  --fork
mongosh "mongodb://127.0.0.1:27018/admin?directConnection=true" \
  --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27018"}]})'
```

Run the complete suite:

```bash
cd apps/api
env TEST_MONGO_URI="mongodb://127.0.0.1:27018/?replicaSet=rs0" \
  ./.venv/bin/python -m pytest -ra
```

## Backup and restore drill

Pause application writes while running the comparison. The script creates a compressed backup,
restores it into a different database, and compares collection names, document counts, `dbHash`
values, and index definitions. The restored verification database is removed after success; the
archive is retained.

```bash
MONGO_URI="mongodb://user@host:27017/?authSource=admin" \
MONGO_DB="nutriflow_prod" \
RESTORE_MONGO_URI="mongodb://127.0.0.1:27018/?replicaSet=rs0" \
BACKUP_DIR="$HOME/nutriflow-backups" \
  ./infra/mongo-backup-restore-check.sh
```

The restore account must be allowed to create and drop the temporary verification database. Set
`KEEP_RESTORE_DB=1` when the restored data should remain available for manual inspection.

## Production operational alerting

Better Stack is the only operational alert router. NutriFlow does not send infrastructure
notifications from FastAPI or the browser: an application process cannot reliably report its own
outage, and technical incidents must not be shown to school users.

The existing public endpoints have deliberately different contracts:

- `GET /api/v1/health` is FastAPI liveness and does not query MongoDB.
- `GET /api/v1/ready` is FastAPI readiness and pings MongoDB; it returns `503` when MongoDB is
  unavailable.
- `GET /api/v1/health/db` is not used for production monitoring and should remain disabled.

The host script checks liveness, readiness, and disk space before sending a successful heartbeat.
It sends a sanitized reason to the heartbeat `/fail` URL on a failed check. External monitors make
the same HTTP checks independently so a stopped host or cron daemon cannot hide an outage.

### Secrets and ownership

Never put recipients or alerting credentials in Git.

| Value | Where it is stored |
| --- | --- |
| Primary and escalation email addresses | Better Stack team members and `NutriFlow Production` policy |
| Telegram bot token | Password manager and the secret URL of the Better Stack outgoing webhooks |
| Telegram group chat ID | Password manager and Better Stack outgoing webhook body templates |
| Better Stack heartbeat URL | `/etc/nutriflow-monitoring.env`, owned by root with mode `600` |
| Better Stack API token, if API automation is later used | Password manager or deployment secret store; the UI setup below does not require one |
| Atlas or hosting-provider integration URL/credentials | The provider and Better Stack integration settings |

Restrict Better Stack administration to the people who may view integration URLs. Rotating the
Telegram token requires updating both outgoing webhook URLs. Rotating the heartbeat URL requires
updating only `/etc/nutriflow-monitoring.env`.

### 1. Create the Telegram destination

1. Open `@BotFather`, run `/newbot`, and create a dedicated NutriFlow alert bot.
2. Save `TELEGRAM_BOT_TOKEN` in the password manager. Anyone holding it can control the bot.
3. Create the private group `NutriFlow Alerts` and add the bot.
4. Send a command addressed to the bot in that group, for example `/start@<bot_username>`.
5. Read the bot's `getUpdates` response and copy `result[].message.chat.id` as
   `TELEGRAM_CHAT_ID`. Do not paste the token or chat ID into a repository file.
6. Add every Telegram recipient to `NutriFlow Alerts`. No application change or deployment is
   required when group membership changes.

The official Telegram references are [BotFather and token
security](https://core.telegram.org/bots/features#botfather) and the [Bot
API](https://core.telegram.org/bots/api). The bot only needs permission to post messages; it does
not need to be a group administrator or have privacy mode disabled.

### 2. Create two Better Stack Telegram webhooks

Better Stack's current Uptime API and UI support incident event filters, POST, custom headers, and
custom JSON bodies. The variables below were checked against the official [outgoing webhook API
reference](https://betterstack.com/docs/uptime/api/create-outgoing-webhook-integration/):
`$NAME`, `$CAUSE`, `$URL`, `$STARTED_AT`, and `$RESOLVED_AT`.

In **Uptime → Integrations → Exporting data → Outgoing webhooks**, create the following
integrations.

#### `NutriFlow Telegram incident started`

- Type/trigger: `Incident` / incident change.
- Event: incident started only.
- URL: `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`.
- Method: `POST`.
- Header: `Content-Type: application/json`.
- Custom request body:

```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "🚨 NutriFlow incident\n$NAME\nПричина: $CAUSE\nURL: $URL\nНачало: $STARTED_AT",
  "disable_web_page_preview": true
}
```

#### `NutriFlow Telegram incident resolved`

- Type/trigger: `Incident` / incident change.
- Event: incident resolved only.
- URL: `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`.
- Method: `POST`.
- Header: `Content-Type: application/json`.
- Custom request body:

```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "✅ NutriFlow restored\n$NAME\nURL: $URL\nВосстановлено: $RESOLVED_AT",
  "disable_web_page_preview": true
}
```

Save each integration and use its delivery log or test action, if present, to confirm Telegram
returns HTTP `200`. A heartbeat incident currently has no public monitor URL, but verify during the
end-to-end test that `$URL` never exposes the secret heartbeat URL. If it does, remove the `URL:
$URL` line from both Telegram templates.

If the active Better Stack plan or UI does not expose two outgoing webhooks, separate started and
resolved event selectors, or the custom header/body fields, stop here. Do not add a FastAPI
Telegram relay. Confirm the plan capability with Better Stack or upgrade the plan first.

### 3. Create the escalation policy

1. In **Team members**, invite the primary responsible person and the remaining responders by
   email.
2. In **Escalation policies → Severities**, create an email-enabled severity, for example
   `NutriFlow email`.
3. In **Escalation policies**, create `NutriFlow Production`.
4. Configure step 1 with no delay:
   - select the primary responsible team member;
   - select `NutriFlow Telegram incident started`;
   - select `NutriFlow Telegram incident resolved`;
   - use the email-enabled severity.
5. Add step 2 with a five-minute delay and select the remaining team members. Selecting
   `Entire team` is acceptable when automatic inclusion of newly invited team members is preferred;
   the primary person will then receive a deliberate repeat after five unacknowledged minutes.
6. Save the policy. Escalation stops when an incident is acknowledged.

Better Stack supports specific webhook integrations as escalation step members; see the official
[escalation policy guide](https://betterstack.com/docs/uptime/escalation-policies/) and [policy
member types](https://betterstack.com/docs/uptime/api/escalation-policies-api-response-params/).
New email recipients are added as Better Stack team members and then selected in step 2, or are
included automatically when the step targets `Entire team`. No NutriFlow deployment is involved.

### 4. Create the external monitors

Create these three HTTP keyword monitors in **Uptime → Monitors**. Use `GET`, TLS verification,
and the `NutriFlow Production` escalation policy for every monitor.

| Monitor | URL | Success condition |
| --- | --- | --- |
| `NutriFlow frontend` | `https://<production-domain>/login` | HTTP 2xx and keyword `Вхід до системи` |
| `NutriFlow API liveness` | `https://<production-domain>/api/v1/health` | HTTP 200 and keyword `"status":"ok"` |
| `NutriFlow API readiness` | `https://<production-domain>/api/v1/ready` | HTTP 200 and keyword `"status":"ok"` |

The readiness monitor must treat `503` as failure so loss of the MongoDB Atlas connection opens an
incident. Do not point either API monitor at `/api/v1/health/db`.

### 5. Create and install the host heartbeat

1. In **Uptime → Heartbeats**, create `NutriFlow production host`.
2. Set **Expect a heartbeat every** to five minutes and **Grace period** to five minutes.
3. Assign `NutriFlow Production`.
4. Copy the generated secret heartbeat URL.
5. On the production host, copy the example outside the repository, fill in the real production
   domain and heartbeat URL, and protect it:

```bash
sudo install -m 600 -o root -g root \
  /srv/nutriflow/infra/monitoring.env.example \
  /etc/nutriflow-monitoring.env
sudoedit /etc/nutriflow-monitoring.env
```

The protected file must contain:

```dotenv
export HEALTH_URL="https://<production-domain>/api/v1/health"
export READY_URL="https://<production-domain>/api/v1/ready"
export HEARTBEAT_URL="https://uptime.betterstack.com/api/v1/heartbeat/<secret>"
export DISK_PATH="/"
export MAX_USED_PERCENT="85"
export MIN_FREE_KB="5242880"
export HTTP_TIMEOUT_SECONDS="10"
```

6. Verify one foreground run, then schedule it every five minutes:

```bash
sudo sh -c 'set -a; . /etc/nutriflow-monitoring.env; set +a; /srv/nutriflow/infra/monitor-host.sh'
```

```cron
*/5 * * * * set -a; . /etc/nutriflow-monitoring.env; set +a; /srv/nutriflow/infra/monitor-host.sh >> /var/log/nutriflow-monitor.log 2>&1
```

The defaults open an incident when disk usage reaches 85% or free space reaches 5 GiB. The
heartbeat is sent only after liveness, readiness, and disk checks all pass. Better Stack also opens
an incident if no heartbeat arrives within the five-minute interval plus five-minute grace period.
Explicit failures use the documented
[`/fail`](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/#reporting-failures)
endpoint.

Create a separate heartbeat later for automatic day closure or any other cron worker. A job
heartbeat must represent that job's own schedule and must not reuse the production-host heartbeat.

### 6. Connect Atlas and hosting-provider alerts later

Do not configure Atlas integration before the production M10 cluster and credentials exist.
Readiness already detects application-to-Atlas connection loss.

After M10 is provisioned:

1. Choose only operationally actionable Atlas alert configurations and mark the critical ones in
   Atlas. Establish thresholds from production workload rather than copying arbitrary values.
2. Prefer the simplest supported route:
   - create a Better Stack incoming email integration and use its generated address as the Atlas
     notification recipient; or
   - create a Better Stack incoming webhook integration and use its secret URL as the Atlas
     webhook target.
3. For a webhook route, use an actual sample payload to map Atlas `alert.open` to incident start,
   `alert.close` to resolution, `id` to the stable alert ID, and `humanReadable` to the cause.
   Atlas does not include configured severity in its webhook payload, so attach the notification
   only to Atlas configurations already classified as critical.
4. Assign `NutriFlow Production` to the Better Stack incoming integration.
5. Keep the incoming address/URL and Atlas webhook secret outside Git.

Atlas documents both [webhook alert delivery](https://www.mongodb.com/docs/atlas/tutorial/webhook-integration/)
and [alert configuration](https://www.mongodb.com/docs/atlas/configure-alerts/). Better Stack
documents [incoming email parsing](https://betterstack.com/docs/uptime/integrating-with-better-uptime/incoming-emails/)
and [incoming webhooks](https://betterstack.com/docs/uptime/incoming-webhooks/).

Route critical alerts from the hosting provider in the same way: use a dedicated Better Stack
incoming email address when the provider sends email, or a dedicated incoming webhook when it
supports lifecycle webhooks. Map a stable provider alert ID and both open/resolved states, assign
`NutriFlow Production`, and test recovery as well as failure.

### 7. End-to-end notification test

Run this after the real Better Stack and Telegram configuration is complete, during an announced
test window:

1. Confirm `NutriFlow production host` has received at least one successful heartbeat.
2. On the host, load the protected environment and deliberately report one test failure without
   revealing its URL:

```bash
sudo sh -c '. /etc/nutriflow-monitoring.env; curl -fsS --data "Planned NutriFlow alert test" "$HEARTBEAT_URL/fail" >/dev/null'
```

3. Leave the incident unacknowledged long enough to verify:
   - the primary responder receives the incident email immediately;
   - `NutriFlow Alerts` receives the `🚨 NutriFlow incident` message;
   - after five minutes, the configured second-step recipients are notified.
4. Resolve the condition by running a successful host check:

```bash
sudo sh -c '. /etc/nutriflow-monitoring.env; /srv/nutriflow/infra/monitor-host.sh'
```

5. Wait for Better Stack to resolve the incident and confirm `NutriFlow Alerts` receives the
   `✅ NutriFlow restored` message.
6. In Better Stack, record the incident timeline and both outgoing webhook delivery results.
   Confirm no Telegram message contains the heartbeat token or another credential.

Repeat a controlled test for each HTTP monitor before launch by temporarily requiring a unique
nonexistent keyword, waiting for the incident, and restoring the documented keyword. Do not test
by taking production down.
