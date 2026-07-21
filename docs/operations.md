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

## Uptime and free disk monitoring

The public liveness endpoint is `GET /api/v1/health`. Keep `/api/v1/health/db` disabled in
production, as required by the application security settings.

Create two monitors in an external service such as Better Stack:

1. An HTTP keyword monitor for `https://<api-host>/api/v1/health`, expecting status 200 and
   `"status":"ok"`.
2. A heartbeat expected every five minutes with a five-minute grace period.

Copy `infra/monitoring.env.example` to a protected file outside the repository, fill in the public
API URL and heartbeat URL, and set mode `600`. Schedule the host check with cron:

```cron
*/5 * * * * set -a; . /etc/nutriflow-monitoring.env; set +a; /srv/nutriflow/infra/monitor-host.sh >> /var/log/nutriflow-monitor.log 2>&1
```

The script reports failure when the API response is invalid, disk usage reaches 85%, or less than
5 GiB remains. If the host itself stops, the missing heartbeat triggers the external incident.
