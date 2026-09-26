# ตัวติดตั้ง Sub360 สำหรับคนที่ไม่เคยใช้คำสั่งคอมพิวเตอร์ — กด Win+R วางบรรทัดนี้แล้วกด Enter:
#
#   powershell -NoProfile -c "irm https://raw.githubusercontent.com/Work360team/Sub360/main/scripts/install.ps1|iex"
#
# (installer\ติดตั้ง Sub360.bat เรียกบรรทัดเดียวกัน สำหรับคนที่ชอบดาวน์โหลดไฟล์แล้วดับเบิลคลิก)
#
# สิ่งที่ทำ: ดาวน์โหลด Node.js และ Git แบบพกพามาไว้ในโฟลเดอร์โปรแกรมเอง (ไม่ต้องใช้สิทธิ์ admin
# ไม่แตะโปรแกรมอื่นในเครื่อง) → ดึง Sub360 ลง %LOCALAPPDATA%\Sub360\app → สร้างไอคอนบนหน้าจอ
# และใน Start menu → เปิดโปรแกรม ส่วน FFmpeg/whisper หน้าตั้งค่าครั้งแรกในเว็บติดตั้งต่อให้เอง
# รันซ้ำได้: ใช้ซ่อม/อัปเดตเป็นรุ่นล่าสุด งานใน data\ และ .env ไม่ถูกแตะ
#
# ไฟล์นี้ต้องเป็น UTF-8 ไม่มี BOM: irm อ่านเป็น UTF-8 ตาม header ของ GitHub ข้อความไทยจึงออกครบ
# (ถ้ามี BOM จะกลายเป็นอักขระแปลกหัวสคริปต์) และต้องรันได้บน Windows PowerShell 5.1 ที่ติดมากับ
# Windows 10/11 — ห้ามใช้ไวยากรณ์ของ PowerShell 7 เช่น ?: ?? && ||
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # แถบ progress ของ PowerShell 5.1 ทำให้ดาวน์โหลดช้าลงหลายเท่า
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $RepoUrl = 'https://github.com/Work360team/Sub360.git'
  $Root = Join-Path $env:LOCALAPPDATA 'Sub360'
  $App = Join-Path $Root 'app'
  $Runtime = Join-Path $App 'runtime'
  $Temp = Join-Path $Root 'download'
  $Launcher = Join-Path $App 'เริ่มโปรแกรม.bat'
  $UserAgent = 'Sub360-installer'

  function Say([string]$msg) { Write-Host "  $msg" }
  function Step([int]$n, [string]$msg) { Write-Host ''; Write-Host "  [$n/4] $msg" -ForegroundColor Yellow }

  function Download([string]$url, [string]$out) {
    $wc = New-Object Net.WebClient
    $wc.Headers['User-Agent'] = $UserAgent
    try { $wc.DownloadFile($url, $out) } finally { $wc.Dispose() }
  }

  function Assert-Sha256([string]$file, [string]$expected) {
    if (-not $expected) { return }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $file).Hash
    if ($actual -ne $expected) { throw "ไฟล์ที่ดาวน์โหลดมาไม่ครบหรือถูกแก้ไข ($(Split-Path $file -Leaf))" }
  }

  # tar.exe ติดมากับ Windows 10 (1803+) แตก zip เร็วกว่า Expand-Archive มาก ถ้าใช้ไม่ได้ค่อยถอยไปใช้ตัวช้า
  function Expand-Zip([string]$zip, [string]$dest) {
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path $tar) {
      try { & $tar -xf $zip -C $dest; if ($LASTEXITCODE -eq 0) { return } } catch {}
      Remove-Item -Recurse -Force $dest
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
    }
    Expand-Archive -Path $zip -DestinationPath $dest -Force
  }

  function Install-Node {
    $node = Join-Path $Runtime 'node\node.exe'
    if (Test-Path $node) { Say "มีอยู่แล้ว ($(& $node -v))"; return }
    $arch = 'x64'
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
    # index.json เรียงรุ่นใหม่สุดก่อน — เอารุ่น LTS ล่าสุดที่มีไฟล์ zip สำหรับเครื่องนี้ (แอปต้องการ 22.13 ขึ้นไป)
    $index = Invoke-RestMethod -UseBasicParsing -Uri 'https://nodejs.org/dist/index.json' -Headers @{ 'User-Agent' = $UserAgent }
    $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-$arch-zip") } | Select-Object -First 1
    if (-not $release) { throw 'หา Node.js รุ่นที่ใช้กับเครื่องนี้ไม่เจอ' }
    $v = $release.version
    $name = "node-$v-win-$arch"
    Say "กำลังดาวน์โหลด Node.js $v (ประมาณ 30 MB)..."
    $zip = Join-Path $Temp "$name.zip"
    Download "https://nodejs.org/dist/$v/$name.zip" $zip
    $sums = (New-Object Net.WebClient).DownloadString("https://nodejs.org/dist/$v/SHASUMS256.txt")
    $line = $sums -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape("$name.zip"))\s*$" } | Select-Object -First 1
    if (-not $line) { throw 'ตรวจความถูกต้องของไฟล์ Node.js ไม่ได้' }
    Assert-Sha256 $zip ($line -split '\s+')[0]
    Say 'กำลังแตกไฟล์...'
    $out = Join-Path $Temp 'node'
    Expand-Zip $zip $out
    $dest = Join-Path $Runtime 'node'
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }   # เศษจากการติดตั้งรอบก่อนที่ไม่สำเร็จ
    Move-Item (Join-Path $out $name) $dest
    Say "พร้อม ($v)"
  }

  function Get-MinGitAsset {
    # ทางหลัก: GitHub API ให้ทั้งชื่อไฟล์และ sha256 · ทางสำรอง (API จำกัดจำนวนครั้งต่อชั่วโมง):
    # อ่าน tag จาก redirect ของหน้า releases/latest แล้วประกอบชื่อไฟล์เอง
    try {
      $rel = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers @{ 'User-Agent' = $UserAgent }
      $asset = $rel.assets | Where-Object { $_.name -match '^MinGit-[\d.]+-64-bit\.zip$' } | Select-Object -First 1
      if ($asset) {
        $sha = ''
        if ($asset.digest -and $asset.digest -match '^sha256:([0-9a-fA-F]{64})$') { $sha = $Matches[1] }
        return @{ Url = $asset.browser_download_url; Sha = $sha; Name = $asset.name }
      }
    } catch {}
    $req = [Net.HttpWebRequest]::Create('https://github.com/git-for-windows/git/releases/latest')
    $req.AllowAutoRedirect = $false
    $req.UserAgent = $UserAgent
    $resp = $req.GetResponse()
    $location = $resp.Headers['Location']
    $resp.Close()
    $tag = ($location -split '/')[-1]
    if ($tag -notmatch '^v(\d+\.\d+\.\d+)\.windows\.(\d+)$') { throw 'หา Git รุ่นล่าสุดไม่เจอ' }
    $ver = $Matches[1]
    if ($Matches[2] -ne '1') { $ver = "$ver.$($Matches[2])" }
    $name = "MinGit-$ver-64-bit.zip"
    return @{ Url = "https://github.com/git-for-windows/git/releases/download/$tag/$name"; Sha = ''; Name = $name }
  }

  function Install-Git {
    $git = Join-Path $Runtime 'git\cmd\git.exe'
    if (Test-Path $git) { Say "มีอยู่แล้ว ($(& $git --version))"; return }
    $asset = Get-MinGitAsset
    Say "กำลังดาวน์โหลด $($asset.Name) (ประมาณ 40 MB)..."
    $zip = Join-Path $Temp $asset.Name
    Download $asset.Url $zip
    Assert-Sha256 $zip $asset.Sha
    Say 'กำลังแตกไฟล์...'
    Expand-Zip $zip (Join-Path $Runtime 'git')
    Say 'พร้อม'
  }

  function Invoke-Git {
    $git = Join-Path $Runtime 'git\cmd\git.exe'
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'   # git เขียนความคืบหน้าลง stderr ซึ่ง PowerShell 5.1 นับเป็น error
    & $git @args 2>&1 | ForEach-Object { if ($_ -is [Management.Automation.ErrorRecord]) { Say $_.Exception.Message } else { Say $_ } }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "คำสั่ง git $($args[0]) ไม่สำเร็จ" }
  }

  # ใช้ init + fetch + checkout แทน clone เพราะโฟลเดอร์มี runtime\ อยู่ก่อนแล้ว (clone ต้องการโฟลเดอร์ว่าง)
  # และทำให้รันซ้ำเพื่อซ่อม/อัปเดตได้ — ไฟล์ที่ git ไม่ได้ติดตาม (data\, .env, runtime\) ไม่ถูกแตะ
  function Install-App {
    Push-Location $App
    try {
      if (-not (Test-Path (Join-Path $App '.git'))) { Invoke-Git init -q }
      # PowerShell 5.1 ถือว่า stderr ของโปรแกรมภายนอกเป็น error และหยุดสคริปต์เมื่อ Stop — ปิดไว้ชั่วคราว
      $git = Join-Path $Runtime 'git\cmd\git.exe'
      $ErrorActionPreference = 'Continue'
      & $git remote get-url origin *> $null
      $hasOrigin = $LASTEXITCODE -eq 0
      $ErrorActionPreference = 'Stop'
      if ($hasOrigin) { Invoke-Git remote set-url origin $RepoUrl } else { Invoke-Git remote add origin $RepoUrl }
      Say 'กำลังดาวน์โหลดโปรแกรม Sub360...'
      Invoke-Git fetch -q origin main
      Invoke-Git checkout -q -f -B main origin/main
      Invoke-Git branch -q --set-upstream-to=origin/main main
    } finally { Pop-Location }
    Say 'พร้อม'
  }

  function New-Shortcuts {
    $shell = New-Object -ComObject WScript.Shell
    $icon = Join-Path $App 'installer\sub360.ico'
    $made = @()
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
      if (-not $folder -or -not (Test-Path $folder)) { continue }
      $link = $shell.CreateShortcut((Join-Path $folder 'Sub360.lnk'))
      $link.TargetPath = $Launcher
      $link.WorkingDirectory = $App
      $link.Description = 'Sub360 — ทำซับไทยบนเครื่องของคุณ'
      if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
      $link.Save()
      $made += $folder
    }
    if ($made.Count -eq 0) { Say 'สร้างไอคอนไม่ได้ — เปิดโปรแกรมได้จากไฟล์ เริ่มโปรแกรม.bat ในโฟลเดอร์ด้านล่าง' }
    else { Say 'สร้างไอคอน Sub360 บนหน้าจอ (Desktop) และใน Start menu แล้ว' }
  }

  Write-Host ''
  Write-Host '  ========================================' -ForegroundColor DarkGray
  Write-Host '    ติดตั้ง Sub360 — ซับไทยสวย ๆ จากเสียงจริง'
  Write-Host '  ========================================' -ForegroundColor DarkGray
  Say 'ใช้เวลาประมาณ 2–5 นาที ขึ้นกับความเร็วอินเทอร์เน็ต ระหว่างนี้ไม่ต้องกดอะไร'

  try {
    New-Item -ItemType Directory -Force -Path $Runtime, $Temp | Out-Null
    Step 1 'เตรียม Node.js (ตัวรันโปรแกรม)'
    Install-Node
    Step 2 'เตรียม Git (ตัวอัปเดตโปรแกรม)'
    Install-Git
    Step 3 'ดาวน์โหลดโปรแกรม Sub360'
    Install-App
    Step 4 'สร้างไอคอนสำหรับเปิดโปรแกรม'
    New-Shortcuts
    Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host '  ติดตั้งเสร็จแล้ว!' -ForegroundColor Green
    Say "โปรแกรมอยู่ที่ $App"
    Say 'กำลังเปิด Sub360 ครั้งแรก — จะมีหน้าต่างดำอีกบานเปิดขึ้นมาและติดตั้งส่วนประกอบต่ออีกสักครู่'
    Say 'จากนั้นเบราว์เซอร์จะเปิดหน้าตั้งค่าครั้งแรกให้เอง'
    Say 'ครั้งต่อไป: ดับเบิลคลิกไอคอน Sub360 บนหน้าจอ'
    Start-Process -FilePath $Launcher -WorkingDirectory $App
    Write-Host ''
    Say 'หน้าต่างนี้จะปิดเองใน 15 วินาที'
    Start-Sleep -Seconds 15
  } catch {
    Write-Host ''
    Write-Host '  ติดตั้งไม่สำเร็จ' -ForegroundColor Red
    Say "สาเหตุ: $($_.Exception.Message)"
    Say 'ลองตรวจอินเทอร์เน็ตแล้วทำใหม่อีกครั้ง (ทำซ้ำได้ ไม่เสียหาย)'
    Say 'ถ้ายังไม่ได้ ให้ถ่ายรูปหน้าต่างนี้ส่งให้ผู้ดูแล'
    Write-Host ''
    Read-Host '  กด Enter เพื่อปิดหน้าต่าง' | Out-Null
  }
}
