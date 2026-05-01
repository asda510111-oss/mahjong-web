# 自動拆分整體錄音檔成 m1.mp3 / m2.mp3 ...
# 用法：
#   .\split-voice.ps1 -InputFile "萬.m4a" -Prefix m -OutDir "..\client\src\assets\sounds\cat"
#   .\split-voice.ps1 -InputFile "筒.m4a" -Prefix p -OutDir "..\client\src\assets\sounds\cat"
#
# 需先安裝 ffmpeg：winget install Gyan.FFmpeg
# 噪音閾值 / 最短停頓可依錄音狀況調整：-NoiseDb -30 -MinSilence 0.3

param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$Prefix,
  [string]$OutDir = ".",
  [string]$NoiseDb = "-30dB",
  [double]$MinSilence = 0.3
)

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "找不到 ffmpeg。請先安裝：winget install Gyan.FFmpeg 或 https://ffmpeg.org/download.html"
  exit 1
}

if (-not (Test-Path $InputFile)) {
  Write-Error "找不到檔案：$InputFile"
  exit 1
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

Write-Host "偵測停頓中（noise=$NoiseDb, min=$MinSilence 秒）..."
$log = & ffmpeg -i $InputFile -af "silencedetect=noise=${NoiseDb}:d=${MinSilence}" -f null - 2>&1

$starts = @()
$ends = @()
foreach ($line in $log) {
  $s = "$line"
  if ($s -match 'silence_start:\s*([\d.]+)') { $starts += [double]$matches[1] }
  if ($s -match 'silence_end:\s*([\d.]+)')   { $ends   += [double]$matches[1] }
}

# 將停頓段反推語音段：[0, starts[0]] [ends[0], starts[1]] ...
$segments = @()
$prev = 0.0
for ($i = 0; $i -lt $starts.Count; $i++) {
  $segStart = $prev
  $segEnd = $starts[$i]
  if ($segEnd -gt $segStart + 0.05) { $segments += @{ Start=$segStart; End=$segEnd } }
  if ($i -lt $ends.Count) { $prev = $ends[$i] }
}
# 最後一段：從最後 silence_end 到檔案結尾
$dur = (& ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 $InputFile)
if ($dur -and $prev -lt [double]$dur - 0.05) {
  $segments += @{ Start=$prev; End=[double]$dur }
}

Write-Host "偵測到 $($segments.Count) 段語音"

$idx = 1
foreach ($seg in $segments) {
  $outName = "${Prefix}${idx}.mp3"
  $outPath = Join-Path $OutDir $outName
  $duration = $seg.End - $seg.Start
  & ffmpeg -y -hide_banner -loglevel error -i $InputFile -ss $seg.Start -t $duration -c:a libmp3lame -q:a 4 $outPath
  Write-Host "  $outName  ($([math]::Round($seg.Start,2))s ~ $([math]::Round($seg.End,2))s)"
  $idx++
}

Write-Host "完成，輸出到 $OutDir"
