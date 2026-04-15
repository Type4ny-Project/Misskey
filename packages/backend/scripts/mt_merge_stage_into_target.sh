#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-example-misskey-user}"
PGPASSWORD="${PGPASSWORD:-example-misskey-pass}"
export PGPASSWORD

if [[ -n "${PG_BIN_DIR:-}" ]]; then
  PSQL="${PG_BIN_DIR%/}/psql"
elif command -v psql >/dev/null 2>&1; then
  PSQL="$(command -v psql)"
elif [[ -x "/opt/homebrew/opt/postgresql@15/bin/psql" ]]; then
  PSQL="/opt/homebrew/opt/postgresql@15/bin/psql"
else
  echo "psql not found. Set PG_BIN_DIR or ensure psql is on PATH." >&2
  exit 1
fi

TARGET_DB="${TARGET_DB:?TARGET_DB is required}"
SOURCE_DB="${SOURCE_DB:?SOURCE_DB is required}"
TENANT_HOST="${TENANT_HOST:?TENANT_HOST is required}"
TENANT_ID="${TENANT_ID:?TENANT_ID is required}"
TENANT_NAME="${TENANT_NAME:-$TENANT_HOST}"

psql_src() {
	"$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" "$@"
}

psql_tgt() {
	"$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" "$@"
}

copy_query() {
	local table="$1"
	local columns="$2"
	local query="$3"
	psql_src -c "\\copy (${query}) TO STDOUT WITH CSV" | psql_tgt -c "\\copy \"${table}\"(${columns}) FROM STDIN WITH CSV"
}

LOCAL_USERS_CTE='WITH local_users AS (SELECT id FROM "user" WHERE host IS NULL)'

psql_tgt -c "INSERT INTO tenant_host_mapping (id, \"tenantId\", host, \"isPrimary\") VALUES ('${TENANT_ID}', '${TENANT_ID}', '${TENANT_HOST}', false) ON CONFLICT (host) DO NOTHING"
psql_tgt -c "INSERT INTO tenant_meta (id, host, name, \"disableRegistration\") VALUES ('${TENANT_ID}', '${TENANT_HOST}', '${TENANT_NAME}', false) ON CONFLICT (host) DO NOTHING"

copy_query "user" 'id, "updatedAt", "lastFetchedAt", username, "usernameLower", name, "followersCount", "followingCount", "notesCount", "avatarId", "bannerId", tags, "isSuspended", "isLocked", "isBot", "isCat", emojis, host, inbox, "sharedInbox", featured, uri, token, "isExplorable", "followersUri", "lastActiveDate", "hideOnlineStatus", "isDeleted", "avatarUrl", "bannerUrl", "avatarBlurhash", "bannerBlurhash", "movedToUri", "alsoKnownAs", "movedAt", "isHibernated", "avatarDecorations", score, "requireSigninToViewContents", "makeNotesFollowersOnlyBefore", "makeNotesHiddenBefore", "chatScope", points' "SELECT id, \"updatedAt\", \"lastFetchedAt\", username, \"usernameLower\", name, \"followersCount\", \"followingCount\", \"notesCount\", NULL AS \"avatarId\", NULL AS \"bannerId\", tags, \"isSuspended\", \"isLocked\", \"isBot\", \"isCat\", emojis, '${TENANT_HOST}' AS host, inbox, \"sharedInbox\", featured, uri, token, \"isExplorable\", \"followersUri\", \"lastActiveDate\", \"hideOnlineStatus\", \"isDeleted\", \"avatarUrl\", \"bannerUrl\", \"avatarBlurhash\", \"bannerBlurhash\", \"movedToUri\", \"alsoKnownAs\", \"movedAt\", \"isHibernated\", \"avatarDecorations\", score, \"requireSigninToViewContents\", \"makeNotesFollowersOnlyBefore\", \"makeNotesHiddenBefore\", \"chatScope\", points FROM \"user\" WHERE host IS NULL"

copy_query "user_profile" '"userId", location, birthday, description, fields, url, email, "emailVerifyCode", "emailVerified", "twoFactorTempSecret", "twoFactorSecret", "twoFactorEnabled", password, "clientData", "autoAcceptFollowed", "alwaysMarkNsfw", "carefulBot", "userHost", "securityKeysAvailable", "usePasswordLessLogin", "pinnedPageId", room, "injectFeaturedNote", "enableWordMute", "mutedWords", "noCrawle", "receiveAnnouncementEmail", "emailNotificationTypes", lang, "mutedInstances", "publicReactions", "autoSensitive", "moderationNote", achievements, "loggedInDates", "preventAiLearning", "twoFactorBackupSecret", "verifiedLinks", "notificationRecieveConfig", "hardMutedWords", "followingVisibility", "followersVisibility", "followedMessage", "loginBonusIsVisible", "pointsVisibility"' "${LOCAL_USERS_CTE} SELECT up.\"userId\", up.location, up.birthday, up.description, up.fields, up.url, up.email, up.\"emailVerifyCode\", up.\"emailVerified\", up.\"twoFactorTempSecret\", up.\"twoFactorSecret\", up.\"twoFactorEnabled\", up.password, up.\"clientData\", up.\"autoAcceptFollowed\", up.\"alwaysMarkNsfw\", up.\"carefulBot\", '${TENANT_HOST}' AS \"userHost\", up.\"securityKeysAvailable\", up.\"usePasswordLessLogin\", NULL AS \"pinnedPageId\", up.room, up.\"injectFeaturedNote\", up.\"enableWordMute\", up.\"mutedWords\", up.\"noCrawle\", up.\"receiveAnnouncementEmail\", up.\"emailNotificationTypes\", up.lang, up.\"mutedInstances\", up.\"publicReactions\", up.\"autoSensitive\", up.\"moderationNote\", up.achievements, up.\"loggedInDates\", up.\"preventAiLearning\", up.\"twoFactorBackupSecret\", up.\"verifiedLinks\", up.\"notificationRecieveConfig\", up.\"hardMutedWords\", up.\"followingVisibility\", up.\"followersVisibility\", up.\"followedMessage\", up.\"loginBonusIsVisible\", up.\"pointsVisibility\" FROM user_profile up INNER JOIN local_users lu ON lu.id = up.\"userId\""

copy_query "user_keypair" '"userId", "publicKey", "privateKey"' "${LOCAL_USERS_CTE} SELECT uk.\"userId\", uk.\"publicKey\", uk.\"privateKey\" FROM user_keypair uk INNER JOIN local_users lu ON lu.id = uk.\"userId\""
copy_query "user_publickey" '"userId", "keyId", "keyPem"' "${LOCAL_USERS_CTE} SELECT up.\"userId\", up.\"keyId\", up.\"keyPem\" FROM user_publickey up INNER JOIN local_users lu ON lu.id = up.\"userId\""

copy_query "following" 'id, "followeeId", "followerId", "followerHost", "followerInbox", "followerSharedInbox", "followeeHost", "followeeInbox", "followeeSharedInbox", notify, "withReplies", "isFollowerHibernated"' "${LOCAL_USERS_CTE} SELECT f.id, f.\"followeeId\", f.\"followerId\", '${TENANT_HOST}' AS \"followerHost\", f.\"followerInbox\", f.\"followerSharedInbox\", '${TENANT_HOST}' AS \"followeeHost\", f.\"followeeInbox\", f.\"followeeSharedInbox\", f.notify, f.\"withReplies\", f.\"isFollowerHibernated\" FROM following f INNER JOIN local_users lu1 ON lu1.id = f.\"followerId\" INNER JOIN local_users lu2 ON lu2.id = f.\"followeeId\" WHERE f.\"followerHost\" IS NULL AND f.\"followeeHost\" IS NULL"

copy_query "follow_request" 'id, "followeeId", "followerId", "requestId", "followerHost", "followerInbox", "followerSharedInbox", "followeeHost", "followeeInbox", "followeeSharedInbox", "withReplies"' "${LOCAL_USERS_CTE} SELECT fr.id, fr.\"followeeId\", fr.\"followerId\", fr.\"requestId\", '${TENANT_HOST}' AS \"followerHost\", fr.\"followerInbox\", fr.\"followerSharedInbox\", '${TENANT_HOST}' AS \"followeeHost\", fr.\"followeeInbox\", fr.\"followeeSharedInbox\", fr.\"withReplies\" FROM follow_request fr INNER JOIN local_users lu1 ON lu1.id = fr.\"followerId\" INNER JOIN local_users lu2 ON lu2.id = fr.\"followeeId\" WHERE fr.\"followerHost\" IS NULL AND fr.\"followeeHost\" IS NULL"

copy_query "blocking" 'id, "blockeeId", "blockerId"' "${LOCAL_USERS_CTE} SELECT b.id, b.\"blockeeId\", b.\"blockerId\" FROM blocking b INNER JOIN local_users lu1 ON lu1.id = b.\"blockerId\" INNER JOIN local_users lu2 ON lu2.id = b.\"blockeeId\""

copy_query "emoji" 'id, "updatedAt", name, host, "originalUrl", uri, type, aliases, category, "publicUrl", license, "localOnly", "isSensitive", "roleIdsThatCanBeUsedThisEmojiAsReaction"' "SELECT DISTINCT ON (name) id, \"updatedAt\", name, '${TENANT_HOST}' AS host, \"originalUrl\", uri, type, aliases, category, \"publicUrl\", license, \"localOnly\", \"isSensitive\", \"roleIdsThatCanBeUsedThisEmojiAsReaction\" FROM emoji WHERE host IS NULL ORDER BY name, \"updatedAt\" DESC NULLS LAST, id DESC"

copy_query "drive_folder" 'id, name, "userId", "parentId"' "${LOCAL_USERS_CTE} SELECT df.id, df.name, df.\"userId\", df.\"parentId\" FROM drive_folder df INNER JOIN local_users lu ON lu.id = df.\"userId\""

copy_query "drive_file" 'id, "userId", "userHost", md5, name, type, size, comment, properties, "storedInternal", url, "thumbnailUrl", "webpublicUrl", "accessKey", "thumbnailAccessKey", "webpublicAccessKey", uri, src, "folderId", "isSensitive", "isLink", blurhash, "webpublicType", "requestHeaders", "requestIp", "maybeSensitive", "maybePorn"' "WITH local_users AS (SELECT id, \"avatarId\", \"bannerId\" FROM \"user\" WHERE host IS NULL), ids AS (SELECT DISTINCT unnest(array_remove(array_cat(array_agg(\"avatarId\"), array_agg(\"bannerId\")), NULL)) AS id FROM local_users) SELECT id, \"userId\", '${TENANT_HOST}' AS \"userHost\", md5, name, type, size, comment, properties, \"storedInternal\", url, \"thumbnailUrl\", \"webpublicUrl\", \"accessKey\", \"thumbnailAccessKey\", \"webpublicAccessKey\", uri, src, \"folderId\", \"isSensitive\", \"isLink\", blurhash, \"webpublicType\", \"requestHeaders\", \"requestIp\", \"maybeSensitive\", \"maybePorn\" FROM drive_file WHERE id IN (SELECT id FROM ids)"

echo "Imported ${SOURCE_DB} into ${TARGET_DB} as tenant host ${TENANT_HOST}"
