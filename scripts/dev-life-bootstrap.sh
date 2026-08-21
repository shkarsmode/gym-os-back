#!/usr/bin/env bash
#
# Copy the REFERENCE data from production into the development database.
#
# The dev environment gets its own empty Postgres, which means no exercise catalogue —
# and without a catalogue the life generator has nothing to build sessions from. Rather
# than maintain a second copy of 149 exercises (which would drift, and whose media URLs
# would rot), the catalogue is copied from production.
#
# WHAT IS COPIED, AND WHY ONLY THIS
#   Exercise          the catalogue itself
#   StrengthStandard  strength levels, which hang off exercises
#   Achievement       achievement DEFINITIONS (not anybody's progress)
#   WorkoutTemplate   only the shared, ownerless ones
#
# All four are reference data authored by the project. NO user, profile, workout, set,
# record, comment or notification is ever read — production member data must not exist
# outside production, and a "just this once" copy is how it ends up somewhere it should
# not be. Read-only against production throughout; the only writes are to the dev database.
#
# Usage, on the host:  bash dev-life-bootstrap.sh

set -euo pipefail

PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-gymos-db}"
DEV_DB_CONTAINER="${DEV_DB_CONTAINER:-gymos-db-dev}"

prod_user=$(docker exec "$PROD_DB_CONTAINER" printenv POSTGRES_USER)
prod_db=$(docker exec "$PROD_DB_CONTAINER" printenv POSTGRES_DB)
dev_user=$(docker exec "$DEV_DB_CONTAINER" printenv POSTGRES_USER)
dev_db=$(docker exec "$DEV_DB_CONTAINER" printenv POSTGRES_DB)

if [ "$PROD_DB_CONTAINER" = "$DEV_DB_CONTAINER" ]; then
    echo "Refusing to run: source and target are the same container." >&2
    exit 2
fi

echo "catalogue: $PROD_DB_CONTAINER/$prod_db  ->  $DEV_DB_CONTAINER/$dev_db"

TABLES=(Exercise StrengthStandard Achievement)

# Truncate first so a re-run REPLACES the catalogue rather than colliding on primary keys.
# Safe because every one of these tables is reference data on the dev side — nothing the
# generator creates lives here, and WorkoutExercise references Exercise with onDelete:
# Restrict, so this is deliberately done before any sessions exist.
for table in "${TABLES[@]}"; do
    docker exec "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -q \
        -c "TRUNCATE TABLE \"$table\" CASCADE;"
done

for table in "${TABLES[@]}"; do
    rows=$(docker exec "$PROD_DB_CONTAINER" pg_dump -U "$prod_user" -d "$prod_db" \
            --data-only --no-owner --no-privileges --table="public.\"$table\"" \
        | docker exec -i "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -q -v ON_ERROR_STOP=1 \
        && docker exec "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -tAc "select count(*) from \"$table\";")
    echo "  $table: $rows rows"
done

# Shared templates only — a template with a userId belongs to a real person.
docker exec "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -q \
    -c "TRUNCATE TABLE \"WorkoutTemplateExercise\", \"WorkoutTemplate\" CASCADE;"
docker exec "$PROD_DB_CONTAINER" psql -U "$prod_user" -d "$prod_db" -tAc \
    "COPY (SELECT * FROM \"WorkoutTemplate\" WHERE \"userId\" IS NULL) TO STDOUT" \
    | docker exec -i "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -q \
        -c "COPY \"WorkoutTemplate\" FROM STDIN"
docker exec "$PROD_DB_CONTAINER" psql -U "$prod_user" -d "$prod_db" -tAc \
    "COPY (SELECT te.* FROM \"WorkoutTemplateExercise\" te
           JOIN \"WorkoutTemplate\" t ON t.id = te.\"workoutTemplateId\"
           WHERE t.\"userId\" IS NULL) TO STDOUT" \
    | docker exec -i "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -q \
        -c "COPY \"WorkoutTemplateExercise\" FROM STDIN"

templates=$(docker exec "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" -tAc \
    "select count(*) from \"WorkoutTemplate\";")
echo "  WorkoutTemplate: $templates rows"
echo "catalogue copied."
