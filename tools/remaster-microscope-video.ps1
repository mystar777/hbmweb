param(
  [Parameter(Mandatory = $true)]
  [string]$SourceVideo,

  [string]$OutputVideo = "assets/scale-dive/microscope-source-120fps.mp4",
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
# optical lens, apply conservative temporal cleanup/sharpening, then calculate
# three motion-compensated intermediate frames between every source frame.
# The result is a true 120 fps / 3,924-frame scrub sequence. A 0.1-second GOP
# keeps browser reverse/forward seeks responsive instead of decoding half a
# second from the previous keyframe on every wheel gesture.
$frameRate = 120
$keyframeInterval = 12
$filter = "crop=900:900:510:90,hqdn3d=1.15:1.0:3.2:2.8,unsharp=5:5:0.38:5:5:0.0,eq=contrast=1.035:saturation=1.025:gamma=1.01,scale=900:900:flags=lanczos,minterpolate=fps=${frameRate}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1:scd=fdiff:scd_threshold=8,setsar=1"

& $ffmpeg -hide_banner -loglevel warning -y `
  -i $source -t 32.7 -vf $filter -an `
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r $frameRate `
  -g $keyframeInterval -keyint_min $keyframeInterval -sc_threshold 0 `
  -video_track_timescale 120000 -movflags +faststart $output

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
