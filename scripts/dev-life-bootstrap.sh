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

prod_psql() { docker exec "$PROD_DB_CONTAINER" psql -U "$prod_user" -d "$prod_db" "$@"; }
dev_psql()  { docker exec -i "$DEV_DB_CONTAINER" psql -U "$dev_user" -d "$dev_db" "$@"; }

# Truncate first so a re-run REPLACES the catalogue rather than colliding on primary keys.
# Safe because every one of these tables is reference data on the dev side — nothing the
# generator creates lives here, and WorkoutExercise references Exercise with onDelete:
# Restrict, so this is deliberately done before any sessions exist.
for table in "${TABLES[@]}"; do
    dev_psql -q -c "TRUNCATE TABLE \"$table\" CASCADE;"
done

# Column lists are read from the catalogue rather than hardcoded, so a new column does not
# silently shift the data one place to the left.
#
# `createdByUserId` is REPLACED WITH NULL. Almost every exercise in production was
# contributed by a real account, and that id is the one piece of member data a catalogue
# copy would otherwise carry across — nulling it is exactly what the schema itself does
# when an author goes away (onDelete: SetNull), so nothing downstream is surprised.
copy_table() {
    local table="$1"
    local select_list target_list
    select_list=$(prod_psql -tAc "
        SELECT string_agg(
                   CASE WHEN column_name = 'createdByUserId' THEN 'NULL' ELSE format('%I', column_name) END,
                   ', ' ORDER BY ordinal_position)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '$table';")
    target_list=$(prod_psql -tAc "
        SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '$table';")
    if [ -z "$select_list" ]; then
        echo "  $table: no such table in production, skipped" >&2
        return
    fi
    prod_psql -tAc "COPY (SELECT $select_list FROM \"$table\") TO STDOUT"         | dev_psql -q -v ON_ERROR_STOP=1 -c "COPY \"$table\" ($target_list) FROM STDIN"
    local rows
    rows=$(dev_psql -tAc "SELECT count(*) FROM \"$table\";")
    echo "  $table: $rows rows"
}

for table in "${TABLES[@]}"; do
    copy_table "$table"
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
