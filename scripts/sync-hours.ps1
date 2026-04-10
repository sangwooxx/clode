param(
    [string]$HoursExcelPath = "",
    [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = Split-Path -Parent $projectRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "data"
}

function Resolve-WorkspaceFile {
    param([string]$Pattern)
    return Get-ChildItem -LiteralPath $workspaceRoot -Filter "*.xlsx" |
        Where-Object { $_.Name -like $Pattern } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Read-ZipText {
    param(
        [System.IO.Compression.ZipArchive]$Zip,
        [string]$EntryName
    )

    $entry = $Zip.Entries | Where-Object { $_.FullName -eq $EntryName } | Select-Object -First 1
    if ($null -eq $entry) {
        throw "Missing archive entry: $EntryName"
    }

    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    try {
        return $reader.ReadToEnd()
    } finally {
        $reader.Close()
        $stream.Close()
    }
}

function Get-SharedStrings {
    param([System.IO.Compression.ZipArchive]$Zip)

    $entry = $Zip.Entries | Where-Object { $_.FullName -eq "xl/sharedStrings.xml" } | Select-Object -First 1
    if ($null -eq $entry) { return @() }

    [xml]$xml = Read-ZipText -Zip $Zip -EntryName "xl/sharedStrings.xml"
    $sharedStrings = New-Object System.Collections.Generic.List[string]
    foreach ($si in $xml.sst.si) {
        if ($si.t) {
            $sharedStrings.Add([string]$si.t)
        } elseif ($si.r) {
            $sharedStrings.Add((($si.r | ForEach-Object { $_.t }) -join ""))
        } else {
            $sharedStrings.Add("")
        }
    }

    return $sharedStrings.ToArray()
}

function Get-CellValue {
    param(
        [Parameter(Mandatory = $true)]$Cell,
        [string[]]$SharedStrings
    )

    if ($null -eq $Cell) { return "" }
    $cellType = if ($Cell.PSObject.Properties["t"]) { [string]$Cell.t } else { "" }
    $cellValue = if ($Cell.PSObject.Properties["v"]) { $Cell.v } else { $null }

    if ($cellType -eq "s" -and $null -ne $cellValue) {
        return [string]$SharedStrings[[int]$cellValue]
    }

    if ($null -ne $cellValue) {
        return [string]$cellValue
    }

    return ""
}

function Get-ColumnLetters {
    param([string]$CellRef)
    if ($CellRef -match "^[A-Z]+") { return $Matches[0] }
    return ""
}

function Convert-ColumnToNumber {
    param([string]$Letters)
    $value = 0
    foreach ($char in $Letters.ToCharArray()) {
        $value = ($value * 26) + ([int][char]$char - [int][char]'A' + 1)
    }
    return $value
}

function Convert-NumberToColumn {
    param([int]$Number)
    $letters = ""
    $value = $Number
    while ($value -gt 0) {
        $remainder = ($value - 1) % 26
        $letters = ([string][char]([int][char]'A' + [int]$remainder)) + $letters
        $value = [math]::Floor(($value - 1) / 26)
    }
    return $letters
}

function Convert-ToDecimalOrNull {
    param([object]$Value)

    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Trim().Replace(" ", "").Replace(",", ".")
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    if ($text -match "^-?\d+(\.\d+)?$") {
        return [decimal]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    return $null
}

function Get-SheetRows {
    param(
        [System.IO.Compression.ZipArchive]$Zip,
        [string]$EntryName,
        [string[]]$SharedStrings
    )

    [xml]$sheetXml = Read-ZipText -Zip $Zip -EntryName $EntryName
    $rows = @{}
    foreach ($row in $sheetXml.worksheet.sheetData.row) {
        $rowIndex = [int]$row.r
        $cells = @{}
        $rowCells = if ($row.PSObject.Properties["c"]) { @($row.c) } else { @() }
        foreach ($cell in $rowCells) {
            $column = Get-ColumnLetters -CellRef ([string]$cell.r)
            $cells[$column] = Get-CellValue -Cell $cell -SharedStrings $SharedStrings
        }
        $rows[$rowIndex] = $cells
    }
    return $rows
}

function Get-SortedColumns {
    param([hashtable]$Row)
    if ($null -eq $Row) { return @() }
    return @($Row.Keys | Sort-Object { Convert-ColumnToNumber $_ })
}

function Normalize-Whitespace {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    return (($Value -replace "\s+", " ").Trim())
}

function Get-MonthInfo {
    param([string]$SheetName)

    $romanMap = @{
        "I" = 1; "II" = 2; "III" = 3; "IV" = 4; "V" = 5; "VI" = 6;
        "VII" = 7; "VIII" = 8; "IX" = 9; "X" = 10; "XI" = 11; "XII" = 12
    }

    if ($SheetName -notmatch "^([IVX]+)\s+(\d{2})$") {
        return $null
    }

    $monthRoman = $Matches[1]
    $yearShort = [int]$Matches[2]
    if (-not $romanMap.ContainsKey($monthRoman)) {
        return $null
    }

    $year = 2000 + $yearShort
    $month = $romanMap[$monthRoman]
    $date = Get-Date -Year $year -Month $month -Day 1

    return [PSCustomObject]@{
        month_key   = $date.ToString("yyyy-MM")
        month_label = $SheetName
        year        = $year
        month       = $month
    }
}

function Parse-HoursSummary {
    param([hashtable]$Rows)

    $blocks = New-Object System.Collections.Generic.List[object]
    foreach ($column in (Get-SortedColumns -Row $Rows[2])) {
        $monthLabel = [string]$Rows[2][$column]
        if ([string]::IsNullOrWhiteSpace($monthLabel)) { continue }
        if (-not $Rows[3].ContainsKey($column)) { continue }
        if ([string]$Rows[3][$column] -ne "lp") { continue }

        $baseIndex = Convert-ColumnToNumber $column
        $nameCol = Convert-NumberToColumn ($baseIndex + 1)
        $hoursCol = Convert-NumberToColumn ($baseIndex + 2)
        $costCol = Convert-NumberToColumn ($baseIndex + 3)
        $blocks.Add([PSCustomObject]@{
            month_label = $monthLabel
            name_col    = $nameCol
            hours_col   = $hoursCol
            cost_col    = $costCol
        })
    }

    $sequenceDate = Get-Date "2025-01-01"
    $records = New-Object System.Collections.Generic.List[object]
    $index = 0

    foreach ($block in $blocks) {
        $monthDate = $sequenceDate.AddMonths($index)
        $monthKey = $monthDate.ToString("yyyy-MM")
        $monthDisplay = "{0:yyyy-MM} {1}" -f $monthDate, ((Get-Culture).TextInfo.ToTitleCase($block.month_label))

        foreach ($rowNumber in 4..220) {
            if (-not $Rows.ContainsKey($rowNumber)) { continue }
            $row = $Rows[$rowNumber]
            $name = Normalize-Whitespace ([string]($row[$block.name_col]))
            if (
                [string]::IsNullOrWhiteSpace($name) -or
                $name -eq "0" -or
                $name.ToLowerInvariant() -eq "suma:" -or
                $name -eq "System.Xml.XmlElement" -or
                $name -match "^-?\d+([.,]\d+)?$"
            ) { continue }

            $hours = Convert-ToDecimalOrNull $row[$block.hours_col]
            $cost = Convert-ToDecimalOrNull $row[$block.cost_col]
            if ($null -eq $hours -and $null -eq $cost) { continue }

            $records.Add([PSCustomObject]@{
                source_name  = $name
                month_key    = $monthKey
                month_label  = $monthDisplay
                labor_hours  = if ($null -ne $hours) { [double]$hours } else { 0.0 }
                labor_cost   = if ($null -ne $cost) { [double]$cost } else { 0.0 }
            })
        }

        $index++
    }

    return $records
}

function Parse-MonthSheet {
    param(
        [string]$SheetName,
        [hashtable]$Rows
    )

    $monthInfo = Get-MonthInfo -SheetName $SheetName
    if ($null -eq $monthInfo) { return $null }
    if (-not $Rows.ContainsKey(2)) { return $null }

    $headerRow = $Rows[2]
    $projectColumns = New-Object System.Collections.Generic.List[object]
    $lastProjectIndex = 0

    foreach ($column in (Get-SortedColumns -Row $headerRow)) {
        $columnIndex = Convert-ColumnToNumber $column
        if ($columnIndex -lt 4) { continue }

        $header = Normalize-Whitespace ([string]$headerRow[$column])
        if ([string]::IsNullOrWhiteSpace($header) -or $header -eq "System.Xml.XmlElement") {
            continue
        }

        $projectColumns.Add([PSCustomObject]@{
            column = $column
            name   = $header
        })

        if ($columnIndex -gt $lastProjectIndex) {
            $lastProjectIndex = $columnIndex
        }
    }

    if ($projectColumns.Count -eq 0) { return $null }

    $totalHoursColumn = Convert-NumberToColumn ($lastProjectIndex + 1)
    $rowsOut = New-Object System.Collections.Generic.List[object]

    foreach ($rowNumber in 3..220) {
        if (-not $Rows.ContainsKey($rowNumber)) { continue }
        $row = $Rows[$rowNumber]
        $employeeName = Normalize-Whitespace ([string]$row["C"])
        if (
            [string]::IsNullOrWhiteSpace($employeeName) -or
            $employeeName -eq "System.Xml.XmlElement" -or
            $employeeName -match "^-?\d+([.,]\d+)?$"
        ) { continue }

        $projectHours = [ordered]@{}
        $totalFromProjects = 0.0
        foreach ($projectColumn in $projectColumns) {
            $hours = Convert-ToDecimalOrNull $row[$projectColumn.column]
            if ($null -eq $hours -or [double]$hours -eq 0) { continue }
            $projectHours[$projectColumn.name] = [double]$hours
            $totalFromProjects += [double]$hours
        }

        $totalHoursRaw = Convert-ToDecimalOrNull $row[$totalHoursColumn]
        $totalHours = if ($null -ne $totalHoursRaw) { [double]$totalHoursRaw } else { $totalFromProjects }

        if ($totalHours -eq 0 -and $projectHours.Count -eq 0) { continue }

        $rowsOut.Add([PSCustomObject]@{
            employee_id   = Normalize-Whitespace ([string]$row["A"])
            worker_code   = Normalize-Whitespace ([string]$row["B"])
            employee_name = $employeeName
            total_hours   = $totalHours
            project_hours = $projectHours
        })
    }

    $investmentNames = @($projectColumns.ToArray() | ForEach-Object { [string]$_.name })
    $monthRowsOut = $rowsOut.ToArray()

    return [PSCustomObject]@{
        month_key   = $monthInfo.month_key
        month_label = $monthInfo.month_label
        year        = $monthInfo.year
        month       = $monthInfo.month
        investments = $investmentNames
        rows        = $monthRowsOut
    }
}

if ([string]::IsNullOrWhiteSpace($HoursExcelPath)) {
    $match = Resolve-WorkspaceFile -Pattern "Zestawienie godzin*"
    if ($null -eq $match) {
        throw "No hours workbook found in workspace."
    }
    $HoursExcelPath = $match.FullName
}

if (-not (Test-Path -LiteralPath $HoursExcelPath)) {
    throw "Hours workbook not found: $HoursExcelPath"
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($HoursExcelPath)
try {
    $sharedStrings = Get-SharedStrings -Zip $zip
    [xml]$workbook = Read-ZipText -Zip $zip -EntryName "xl/workbook.xml"
    [xml]$rels = Read-ZipText -Zip $zip -EntryName "xl/_rels/workbook.xml.rels"

    $sheetTargets = @{}
    foreach ($relationship in $rels.Relationships.Relationship) {
        $sheetTargets[$relationship.Id] = "xl/" + $relationship.Target
    }

    $summarySheet = $workbook.workbook.sheets.sheet | Where-Object { $_.name -eq "zestawienie" } | Select-Object -First 1
    if ($null -eq $summarySheet) {
        throw "Sheet 'zestawienie' not found in hours workbook."
    }

    $summaryRid = $summarySheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $summaryRows = Get-SheetRows -Zip $zip -EntryName $sheetTargets[$summaryRid] -SharedStrings $sharedStrings
    $summaryRecords = Parse-HoursSummary -Rows $summaryRows

    $monthSheets = New-Object System.Collections.Generic.List[object]
    foreach ($sheet in $workbook.workbook.sheets.sheet) {
        if ($sheet.name -eq "zestawienie") { continue }
        $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
        if (-not $sheetTargets.ContainsKey($rid)) { continue }

        $monthRows = Get-SheetRows -Zip $zip -EntryName $sheetTargets[$rid] -SharedStrings $sharedStrings
        $monthSheet = Parse-MonthSheet -SheetName ([string]$sheet.name) -Rows $monthRows
        if ($null -ne $monthSheet) {
            $monthSheets.Add($monthSheet)
        }
    }

    $employeesMap = @{}
    $investmentSet = New-Object System.Collections.Generic.HashSet[string]
    foreach ($month in $monthSheets) {
        foreach ($investment in $month.investments) {
            [void]$investmentSet.Add([string]$investment)
        }

        foreach ($row in $month.rows) {
            $employeeKey = Normalize-Whitespace $row.employee_name
            if (-not $employeesMap.ContainsKey($employeeKey)) {
                $employeesMap[$employeeKey] = [ordered]@{
                    name         = $row.employee_name
                    worker_code  = $row.worker_code
                    employee_ids = New-Object System.Collections.Generic.HashSet[string]
                    months_count = 0
                }
            }

            if (-not [string]::IsNullOrWhiteSpace($row.employee_id)) {
                [void]$employeesMap[$employeeKey].employee_ids.Add([string]$row.employee_id)
            }
            $employeesMap[$employeeKey].months_count++
        }
    }

    $employees = @(
        $employeesMap.GetEnumerator() |
        Sort-Object Name |
        ForEach-Object {
            [PSCustomObject]@{
                name         = $_.Value.name
                worker_code  = $_.Value.worker_code
                employee_ids = @($_.Value.employee_ids | ForEach-Object { [string]$_ })
                months_count = $_.Value.months_count
            }
        }
    )

    $allInvestments = @($investmentSet | ForEach-Object { [string]$_ } | Sort-Object)
    $sortedMonths = @($monthSheets.ToArray() | Sort-Object month_key)

    $formSeed = [PSCustomObject]@{
        meta = [PSCustomObject]@{
            generated_at = (Get-Date).ToString("s")
            source_file  = [System.IO.Path]::GetFileName($HoursExcelPath)
            months_count = $monthSheets.Count
        }
        employees     = $employees
        investments   = $allInvestments
        months        = $sortedMonths
        default_month = if ($sortedMonths.Count -gt 0) { $sortedMonths[-1].month_key } else { "" }
    }

    $summaryRecords | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "labor-monthly.json") -Encoding UTF8
    $formSeed | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $OutputDir "hours-form-seed.json") -Encoding UTF8
    ("window.HOURS_FORM_SEED = " + ($formSeed | ConvertTo-Json -Depth 10) + ";") | Set-Content -LiteralPath (Join-Path $OutputDir "hours-form-seed.js") -Encoding UTF8

    Write-Host "Labor sync complete. Records: $($summaryRecords.Count). Form months: $($monthSheets.Count). Employees: $($employees.Count)"
} finally {
    $zip.Dispose()
}
