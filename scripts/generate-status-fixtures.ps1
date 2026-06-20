$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location) "scripts" }
$projectRoot = Split-Path -Parent $scriptRoot
$dataRoot = Join-Path $projectRoot "data"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Convert-ToCsvLine {
  param([object[]]$Values)

  return ($Values | ForEach-Object {
    $value = [string]$_
    if ($value -match '[,"\r\n]') {
      '"' + $value.Replace('"', '""') + '"'
    } else {
      $value
    }
  }) -join ","
}

function Write-CsvFile {
  param(
    [string]$Path,
    [string[]]$Headers,
    [System.Collections.Generic.List[string]]$Rows
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add((Convert-ToCsvLine $Headers))
  $lines.AddRange($Rows)
  [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

function Format-Decimal {
  param([double]$Value)

  return $Value.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
}

$walkingPeriods = @(
  @{ Id = 1; Start = "2026/06/08"; End = "2026/06/14" },
  @{ Id = 2; Start = "2026/06/15"; End = "2026/06/21" },
  @{ Id = 3; Start = "2026/06/22"; End = "2026/06/28" },
  @{ Id = 4; Start = "2026/06/29"; End = "2026/07/05" },
  @{ Id = 5; Start = "2026/07/06"; End = "2026/07/12" },
  @{ Id = 6; Start = "2026/07/13"; End = "2026/07/19" },
  @{ Id = 7; Start = "2026/07/20"; End = "2026/07/26" },
  @{ Id = 8; Start = "2026/07/27"; End = "2026/08/02" },
  @{ Id = 9; Start = "2026/08/03"; End = "2026/08/09" },
  @{ Id = 10; Start = "2026/08/10"; End = "2026/08/16" },
  @{ Id = 11; Start = "2026/08/17"; End = "2026/08/23" },
  @{ Id = 12; Start = "2026/08/24"; End = "2026/08/30" },
  @{ Id = 13; Start = "2026/08/31"; End = "2026/09/06" },
  @{ Id = 14; Start = "2026/09/07"; End = "2026/09/13" },
  @{ Id = 15; Start = "2026/09/14"; End = "2026/09/20" },
  @{ Id = 16; Start = "2026/09/21"; End = "2026/09/27" },
  @{ Id = 17; Start = "2026/09/28"; End = "2026/10/04" },
  @{ Id = 18; Start = "2026/10/05"; End = "2026/10/11" }
)

$measurementDates = @(
  "2026/06/08",
  "2026/06/22",
  "2026/07/06",
  "2026/07/20",
  "2026/08/03",
  "2026/08/17",
  "2026/08/31",
  "2026/09/14",
  "2026/09/28",
  "2026/10/12"
)

$walkingRows = [System.Collections.Generic.List[string]]::new()
for ($participant = 1; $participant -le 27; $participant++) {
  foreach ($period in $walkingPeriods) {
    $steps = 42000 + ($participant * 3650) + ($period.Id * 1275) + ((($participant * 17) + ($period.Id * 29)) % 11) * 731
    $walkingRows.Add((Convert-ToCsvLine @(
      $participant,
      ("健走{0:D2}" -f $participant),
      $period.Id,
      $period.Start,
      $period.End,
      "是",
      $steps
    )))
  }
}

Write-CsvFile `
  -Path (Join-Path $dataRoot "walking.csv") `
  -Headers @("參賽者編號", "參賽者暱稱", "週期編號", "週期開始日期", "週期結束日期", "是否有效", "周步數") `
  -Rows $walkingRows

function New-HealthRows {
  param(
    [int]$ParticipantCount,
    [string]$NicknamePrefix,
    [int]$ValueOffset
  )

  $rows = [System.Collections.Generic.List[string]]::new()

  for ($participant = 1; $participant -le $ParticipantCount; $participant++) {
    $cumulativeWeight = 0.0
    $cumulativeBodyFat = 0.0
    $cumulativeMuscle = 0.0

    for ($measurement = 1; $measurement -le $measurementDates.Count; $measurement++) {
      $weight = 0.20 + (($participant * 13 + $measurement * 7 + $ValueOffset) % 19) / 20.0
      $bodyFat = 0.10 + (($participant * 11 + $measurement * 5 + $ValueOffset) % 23) / 20.0
      $muscle = 0.05 + (($participant * 7 + $measurement * 3 + $ValueOffset) % 13) / 20.0

      if (($participant + $measurement + $ValueOffset) % 8 -eq 0) {
        $weight *= -0.25
      }
      if (($participant * 2 + $measurement + $ValueOffset) % 10 -eq 0) {
        $bodyFat *= -0.20
      }

      $cumulativeWeight += $weight
      $cumulativeBodyFat += $bodyFat
      $cumulativeMuscle += $muscle
      $extraPoints = ($participant + $measurement + $ValueOffset) % 3

      $rows.Add((Convert-ToCsvLine @(
        $participant,
        ("{0}{1:D2}" -f $NicknamePrefix, $participant),
        $measurementDates[$measurement - 1],
        $measurement,
        "是",
        $extraPoints,
        (Format-Decimal $weight),
        (Format-Decimal $bodyFat),
        (Format-Decimal $muscle),
        (Format-Decimal $cumulativeWeight),
        (Format-Decimal $cumulativeBodyFat),
        (Format-Decimal $cumulativeMuscle)
      )))
    }
  }

  return $rows
}

$healthHeaders = @(
  "參賽者編號",
  "參賽者暱稱",
  "量測日期",
  "量測編號",
  "是否有效",
  "額外積分",
  "體重減少率",
  "體脂肪減少率",
  "骨骼肌增加率",
  "累計體重減少率",
  "累計體脂肪減少率",
  "累計骨骼肌增加率"
)

Write-CsvFile `
  -Path (Join-Path $dataRoot "health-men.csv") `
  -Headers $healthHeaders `
  -Rows (New-HealthRows -ParticipantCount 10 -NicknamePrefix "男健" -ValueOffset 2)

Write-CsvFile `
  -Path (Join-Path $dataRoot "health-women.csv") `
  -Headers $healthHeaders `
  -Rows (New-HealthRows -ParticipantCount 11 -NicknamePrefix "女健" -ValueOffset 5)
