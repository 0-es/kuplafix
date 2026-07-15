param(
  [string]$CertDirectory = (Join-Path $PSScriptRoot 'certs')
)

$ErrorActionPreference = 'Stop'
$openssl = (Get-Command openssl -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $CertDirectory | Out-Null

$caKey = Join-Path $CertDirectory 'kuplafix-local-ca-key.pem'
$caCert = Join-Path $CertDirectory 'kuplafix-local-ca.pem'
$serverKey = Join-Path $CertDirectory 'localhost-key.pem'
$serverCert = Join-Path $CertDirectory 'localhost-cert.pem'
$serverCsr = Join-Path $CertDirectory 'localhost.csr'
$extensions = Join-Path $CertDirectory 'localhost.ext'

if (!(Test-Path $caCert)) {
  & $openssl req -x509 -new -nodes -newkey rsa:2048 -keyout $caKey -out $caCert -days 3650 -subj '/CN=KuplaFix Local Development CA'
  certutil -user -addstore Root $caCert | Out-Null
}

@"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
DNS.1=localhost
IP.1=127.0.0.1
"@ | Set-Content -LiteralPath $extensions -Encoding ascii

& $openssl req -new -nodes -newkey rsa:2048 -keyout $serverKey -out $serverCsr -subj '/CN=localhost'
& $openssl x509 -req -in $serverCsr -CA $caCert -CAkey $caKey -CAcreateserial -out $serverCert -days 825 -sha256 -extfile $extensions

Write-Host 'Local HTTPS certificate installed for the current Windows user.'
Write-Host 'Start the server with: node dev/serve-local.mjs'
