# Renders media/icon.png (128x128): a Mochimon wearing a crown on an LCD tile.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent

$crown = @('#...#...#', '##.###.##', '#########')
$pet = @(
  '.......##.......',
  '........#.......',
  '.....######.....',
  '...##......##...',
  '..#..........#..',
  '.#..##....##..#.',
  '.#..##....##..#.',
  '.#............#.',
  '.#.##......##.#.',
  '.#....#..#....#.',
  '.#.....##.....#.',
  '..#..........#..',
  '...##......##...',
  '.....######.....',
  '....#......#....',
  '...##......##...'
)

$size = 128
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded LCD tile.
$bg = [System.Drawing.ColorTranslator]::FromHtml('#c3cc9f')
$ghost = [System.Drawing.ColorTranslator]::FromHtml('#b5bf90')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#2c3222')
$frame = [System.Drawing.ColorTranslator]::FromHtml('#e0679a')
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 26
$path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($size - $r - 1, 0, $r, $r, 270, 90)
$path.AddArc($size - $r - 1, $size - $r - 1, $r, $r, 0, 90); $path.AddArc(0, $size - $r - 1, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush $frame), $path)
$g.SmoothingMode = 'None'
$g.FillRectangle((New-Object System.Drawing.SolidBrush $bg), 10, 10, 108, 108)

# Pixel grid: 18 x 18 cells of 6px inside the tile.
$cell = 6; $ox = 10; $oy = 10; $n = 18
$on = @{}
for ($y = 0; $y -lt $crown.Count; $y++) { for ($x = 0; $x -lt 9; $x++) { if ($crown[$y][$x] -eq '#') { $on["$($x + 5),$($y)"] = 1 } } }
for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) { if ($pet[$y][$x] -eq '#') { $on["$($x + 1),$($y + 2)"] = 1 } } }
$inkB = New-Object System.Drawing.SolidBrush $ink
$ghostB = New-Object System.Drawing.SolidBrush $ghost
for ($y = 0; $y -lt $n; $y++) {
  for ($x = 0; $x -lt $n; $x++) {
    $b = if ($on.ContainsKey("$x,$y")) { $inkB } else { $ghostB }
    $g.FillRectangle($b, $ox + $x * $cell + 1, $oy + $y * $cell + 1, $cell - 1, $cell - 1)
  }
}
$out = Join-Path $root 'media/icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Wrote $out"
