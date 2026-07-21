#!/bin/sh
set -eu

: "${MONGO_URI:?MONGO_URI is required}"
: "${MONGO_DB:?MONGO_DB is required}"

RESTORE_MONGO_URI="${RESTORE_MONGO_URI:-$MONGO_URI}"
RESTORE_DB="${RESTORE_DB:-${MONGO_DB}_restore_check}"
BACKUP_DIR="${BACKUP_DIR:-${HOME:?HOME is required}/nutriflow-backups}"
KEEP_RESTORE_DB="${KEEP_RESTORE_DB:-0}"

if [ "$RESTORE_DB" = "$MONGO_DB" ]; then
    echo "RESTORE_DB must differ from MONGO_DB" >&2
    exit 2
fi

for tool in mongodump mongorestore mongosh; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool is required" >&2
        exit 2
    fi
done

umask 077
mkdir -p "$BACKUP_DIR"

if [ -n "${BACKUP_FILE:-}" ]; then
    ARCHIVE="$BACKUP_FILE"
else
    STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
    ARCHIVE="$BACKUP_DIR/${MONGO_DB}-${STAMP}.archive.gz"
fi

TMP_DIR="$(mktemp -d)"
RESTORE_CREATED=0

cleanup() {
    if [ "$RESTORE_CREATED" -eq 1 ] && [ "$KEEP_RESTORE_DB" -ne 1 ]; then
        mongosh "$RESTORE_MONGO_URI" --quiet \
            --eval "db.getSiblingDB('$RESTORE_DB').dropDatabase()" >/dev/null 2>&1 || true
    fi
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

snapshot() {
    SNAPSHOT_URI="$1"
    SNAPSHOT_DB="$2"
    SNAPSHOT_FILE="$3"

    mongosh "$SNAPSHOT_URI" --quiet --eval "
        const database = db.getSiblingDB('$SNAPSHOT_DB');
        const collections = database.getCollectionNames()
            .filter((name) => !name.startsWith('system.'))
            .sort();
        const counts = Object.fromEntries(
            collections.map((name) => [name, database.getCollection(name).countDocuments({})])
        );
        const hashes = database.runCommand({dbHash: 1, collections}).collections;
        const indexes = Object.fromEntries(collections.map((name) => [
            name,
            database.getCollection(name).getIndexes()
                .map((index) => {
                    delete index.v;
                    delete index.ns;
                    return index;
                })
                .sort((left, right) => left.name.localeCompare(right.name)),
        ]));
        print(JSON.stringify({collections, counts, hashes, indexes}));
    " > "$SNAPSHOT_FILE"
}

mongodump \
    --uri "$MONGO_URI" \
    --db "$MONGO_DB" \
    --archive="$ARCHIVE" \
    --gzip

if [ ! -s "$ARCHIVE" ]; then
    echo "Backup archive is empty: $ARCHIVE" >&2
    exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
else
    CHECKSUM="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
fi

mongorestore \
    --uri "$RESTORE_MONGO_URI" \
    --archive="$ARCHIVE" \
    --gzip \
    --nsInclude="${MONGO_DB}.*" \
    --nsFrom="${MONGO_DB}.*" \
    --nsTo="${RESTORE_DB}.*" \
    --dryRun >/dev/null

mongosh "$RESTORE_MONGO_URI" --quiet \
    --eval "db.getSiblingDB('$RESTORE_DB').dropDatabase()" >/dev/null

mongorestore \
    --uri "$RESTORE_MONGO_URI" \
    --archive="$ARCHIVE" \
    --gzip \
    --nsInclude="${MONGO_DB}.*" \
    --nsFrom="${MONGO_DB}.*" \
    --nsTo="${RESTORE_DB}.*" \
    --drop >/dev/null
RESTORE_CREATED=1

snapshot "$MONGO_URI" "$MONGO_DB" "$TMP_DIR/source.json"
snapshot "$RESTORE_MONGO_URI" "$RESTORE_DB" "$TMP_DIR/restored.json"

if ! cmp -s "$TMP_DIR/source.json" "$TMP_DIR/restored.json"; then
    echo "Restore verification failed" >&2
    diff -u "$TMP_DIR/source.json" "$TMP_DIR/restored.json" || true
    exit 1
fi

echo "Restore verification passed"
echo "Archive: $ARCHIVE"
echo "SHA-256: $CHECKSUM"
