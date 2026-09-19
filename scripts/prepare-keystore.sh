#!/usr/bin/env bash
# Converts the signing keystore from GitHub secrets into a PKCS12 file that
# apksigner can use. Handles JKS, JCEKS, PKCS12 and the BouncyCastle BKS/UBER
# formats produced by Sketchware (the original app's easypediamcqs.jks is UBER).
#
# Inputs (environment):
#   SRC_KEYSTORE       path to the decoded keystore
#   KEYSTORE_PASSWORD  store password
#   KEY_PASSWORD       key password (optional, defaults to KEYSTORE_PASSWORD)
#   KEY_ALIAS          alias (optional, auto-detected when the store has one key)
#   OUT_P12            output path for the PKCS12 keystore
#   BCPROV_JAR         (optional) path to an existing bcprov jar
# Outputs: writes OUT_P12 and prints "SIGN_ALIAS=<alias>" as the last line.
set -euo pipefail

: "${SRC_KEYSTORE:?}" "${KEYSTORE_PASSWORD:?}" "${OUT_P12:?}"
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"
KEYTOOL="${KEYTOOL:-keytool}"
WORK="$(dirname "$OUT_P12")"

magic=$(head -c 4 "$SRC_KEYSTORE" | od -An -tx1 | tr -d ' \n')
provider_args=()
case "$magic" in
  feedfeed) types=(JKS) ;;
  cececece) types=(JCEKS) ;;
  3082*|3080*) types=(PKCS12) ;;
  00000001|00000002)
    # BouncyCastle keystore. BKS keeps entries readable; UBER encrypts everything.
    types=(BKS UBER)
    if [ -z "${BCPROV_JAR:-}" ]; then
      BCPROV_JAR="$WORK/bcprov.jar"
      curl -fsSL -o "$BCPROV_JAR" \
        https://repo1.maven.org/maven2/org/bouncycastle/bcprov-jdk18on/1.78.1/bcprov-jdk18on-1.78.1.jar
    fi
    provider_args=(-providerclass org.bouncycastle.jce.provider.BouncyCastleProvider -providerpath "$BCPROV_JAR")
    ;;
  *) echo "::error::Unknown keystore format (magic $magic)"; exit 1 ;;
esac

src_type=""
for t in "${types[@]}"; do
  if "$KEYTOOL" -list -storetype "$t" "${provider_args[@]}" -keystore "$SRC_KEYSTORE" \
       -storepass:env KEYSTORE_PASSWORD >/dev/null 2>&1; then
    src_type="$t"; break
  fi
done
if [ -z "$src_type" ]; then
  echo "::error::Could not open the keystore (tried ${types[*]}). Check KEYSTORE_PASSWORD."
  exit 1
fi
echo "Keystore type: $src_type"

alias="${KEY_ALIAS:-}"
if [ -z "$alias" ]; then
  mapfile -t aliases < <("$KEYTOOL" -list -storetype "$src_type" "${provider_args[@]}" -keystore "$SRC_KEYSTORE" \
      -storepass:env KEYSTORE_PASSWORD 2>/dev/null | grep -i "PrivateKeyEntry" | cut -d, -f1)
  if [ "${#aliases[@]}" -ne 1 ]; then
    echo "::error::Found ${#aliases[@]} keys; set the KEY_ALIAS secret to one of: ${aliases[*]:-none}"
    exit 1
  fi
  alias="${aliases[0]}"
  echo "Detected key alias: $alias"
fi

rm -f "$OUT_P12"
# PKCS12 uses one password for store and key, so the key gets KEYSTORE_PASSWORD.
"$KEYTOOL" -importkeystore -noprompt \
  -srckeystore "$SRC_KEYSTORE" -srcstoretype "$src_type" "${provider_args[@]}" \
  -srcstorepass:env KEYSTORE_PASSWORD -srcalias "$alias" -srckeypass:env KEY_PASSWORD \
  -destkeystore "$OUT_P12" -deststoretype PKCS12 \
  -deststorepass:env KEYSTORE_PASSWORD -destkeypass:env KEYSTORE_PASSWORD -destalias "$alias" >/dev/null

# Public certificate fingerprint (needed in Firebase for Google sign-in).
"$KEYTOOL" -list -v -storetype PKCS12 -keystore "$OUT_P12" -storepass:env KEYSTORE_PASSWORD \
  | grep -E "^\s*SHA1:" | head -1 | sed 's/^\s*/Certificate /'

echo "SIGN_ALIAS=$alias"
