param(
  [Parameter(Mandatory = $true)]
  [string]$SourceVideo,

  [string]$OutputVideo = "assets/scale-dive/microscope-source-remastered.mp4",
  [string]$PosterImage = "assets/scale-dive/microscope-source-poster.jpg"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ffmpeg = Join-Path $repoRoot ".video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
$source = Resolve-Path -LiteralPath $SourceVideo
$output = Join-Path $repoRoot $OutputVideo
$poster = Join-Path $repoRoot $PosterImage

if (-not (Test-Path -LiteralPath $ffmpeg)) {
  throw "ffmpeg was not found at $ffmpeg"
}

New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null

# The supplied Short changes to unrelated footage after the microscope dive.
# Decode the continuous 0-32.7 second sequence frame-by-frame, crop the central
# optical lens, apply conservative temporal cleanup/sharpening, and re-encode
# with frequent keyframes so reverse/forward browser scrubbing stays responsive.
$filter = "crop=900:900:510:90,hqdn3d=1.15:1.0:3.2:2.8,unsharp=5:5:0.38:5:5:0.0,eq=contrast=1.035:saturation=1.025:gamma=1.01,scale=900:900:flags=lanczos,setsar=1"

& $ffmpeg -hide_banner -loglevel warning -y `
  -i $source -t 32.7 -vf $filter -an `
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -r 30 -g 15 `
  -movflags +faststart $output

if ($LASTEXITCODE -ne 0) {
  throw "Video remaster failed with exit code $LASTEXITCODE"
}

& $ffmpeg -hide_banner -loglevel warning -y `
  -ss 0.4 -i $output -frames:v 1 -update 1 -q:v 2 $poster

if ($LASTEXITCODE -ne 0) {
  throw "Poster extraction failed with exit code $LASTEXITCODE"
}

Write-Host "Remastered video: $output"
Write-Host "Poster: $poster"
