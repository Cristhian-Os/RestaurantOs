# Copia de seguridad MANUAL de producción (esquema + datos + usuarios) usando Docker.
# Pide la cadena de conexión con una casilla oculta. NO la guarda ni la muestra.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $HOME 'Backups-RestaurantOS'
$f = Get-Date -Format 'yyyy-MM-dd_HHmm'
$sec = Read-Host 'Pega la cadena de conexion (no se vera)' -AsSecureString
$env:DBURL = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

function Volcar($nombre, $opciones) {
  $cmd = 'pg_dump $DBURL ' + $opciones + ' -f /out/' + $nombre + '_' + $f + '.sql'
  docker run --rm -e DBURL -v "${dir}:/out" postgres:17 sh -c $cmd
  if ($LASTEXITCODE -ne 0) { throw "Fallo la copia: $nombre" }
}
Volcar 'esquema' '--schema-only --schema=public --no-owner --no-privileges'
Volcar 'datos'   '--data-only --schema=public --no-owner --no-privileges'
Volcar 'auth'    '--data-only --schema=auth --no-owner --no-privileges'
Remove-Item Env:DBURL

Get-ChildItem $dir "*_$f.sql" | Select-Object Name, @{n='KB';e={[int]($_.Length/1KB)}}
Write-Host "Listo. Escribe 'listo' en el chat."
