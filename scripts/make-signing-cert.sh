#!/bin/sh
# Creates a self-signed "Wandful Dev" code-signing certificate in your login keychain.
# Run ONCE, by hand (it may ask for your login password / a keychain "Allow" click):
#   sh scripts/make-signing-cert.sh
# Afterwards `npm run build:mac` signs every build with the same identity, so macOS
# keeps the Accessibility permission across rebuilds.
set -e
if security find-identity -v -p codesigning | grep -q "Wandful Dev"; then
  echo "Wandful Dev identity already exists"; exit 0
fi
tmp=$(mktemp -d)
cat > "$tmp/ext.cnf" <<CNF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=Wandful Dev
[ext]
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
basicConstraints=critical,CA:false
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$tmp/ext.cnf" -keyout "$tmp/key.pem" -out "$tmp/cert.pem" >/dev/null 2>&1
openssl pkcs12 -export -legacy -out "$tmp/id.p12" -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -passout pass:wandful 2>/dev/null \
  || openssl pkcs12 -export -out "$tmp/id.p12" -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -passout pass:wandful
KC="$HOME/Library/Keychains/login.keychain-db"
security import "$tmp/id.p12" -k "$KC" -P wandful -T /usr/bin/codesign -T /usr/bin/security
security add-trusted-cert -r trustRoot -p codeSign -k "$KC" "$tmp/cert.pem"
rm -rf "$tmp"
security find-identity -v -p codesigning | grep "Wandful Dev" && echo "Done. Now: npm run build:mac"
