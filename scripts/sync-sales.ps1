param(
    [string]$SalesExcelPath = "",
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
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    try { $reader.ReadToEnd() } finally { $reader.Close(); $stream.Close() }
}

function Get-SharedStrings {
    param([System.IO.Compression.ZipArchive]$Zip)
    [xml]$xml = Read-ZipText -Zip $Zip -EntryName "xl/sharedStrings.xml"
    $sharedStrings = New-Object System.Collections.Generic.List[string]
    foreach ($si in $xml.sst.si) {
        if ($si.PSObject.Properties["t"]) { $sharedStrings.Add([string]$si.t) }
        elseif ($si.PSObject.Properties["r"]) { $sharedStrings.Add((($si.r | ForEach-Object { $_.t }) -join "")) }
        else { $sharedStrings.Add("") }
    }
    return $sharedStrings.ToArray()
}

function Get-CellValue {
    param(
        [Parameter(Mandatory = $true)]$Cell,
        [string[]]$SharedStrings
    )
    $cellType = if ($Cell.PSObject.Properties["t"]) { [string]$Cell.t } else { "" }
    if ($cellType -eq "s" -and $Cell.PSObject.Properties["v"]) {
        return [string]$SharedStrings[[int]$Cell.v]
    }
    if ($Cell.PSObject.Properties["v"]) { return [string]$Cell.v }
    return ""
}

function Convert-ToDecimalOrNull {
    param([object]$Value)
    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Trim().Replace(" ", "").Replace(",", ".")
    if ($text -match "^-?\d+(\.\d+)?$") {
        return [decimal]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    return $null
}

function Convert-ExcelDate {
    param([object]$Value)
    $number = Convert-ToDecimalOrNull $Value
    if ($null -eq $number) { return $null }
    return ([datetime]"1899-12-30").AddDays([double]$number)
}

if ([string]::IsNullOrWhiteSpace($SalesExcelPath)) {
    $match = Resolve-WorkspaceFile -Pattern "Plik sprzeda*AGZ*"
    if ($null -eq $match) { throw "No sales workbook found in workspace." }
    $SalesExcelPath = $match.FullName
}

if (-not (Test-Path -LiteralPath $SalesExcelPath)) {
    throw "Sales workbook not found: $SalesExcelPath"
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($SalesExcelPath)
try {
    $sharedStrings = Get-SharedStrings -Zip $zip
    [xml]$sheet = Read-ZipText -Zip $zip -EntryName "xl/worksheets/sheet1.xml"
    $records = New-Object System.Collections.Generic.List[object]

    foreach ($row in ($sheet.worksheet.sheetData.row | Select-Object -Skip 1)) {
        $cells = @{}
        $rowCells = if ($row.PSObject.Properties["c"]) { @($row.c) } else { @() }
        foreach ($cell in $rowCells) {
            $cells[[string]$cell.r -replace "\d+", ""] = Get-CellValue -Cell $cell -SharedStrings $sharedStrings
        }

        $category = [string]$cells["L"]
        $net = Convert-ToDecimalOrNull $cells["I"]
        if ([string]::IsNullOrWhiteSpace($category) -or $null -eq $net) { continue }

        $saleDate = Convert-ExcelDate $cells["D"]
        $records.Add([PSCustomObject]@{
            document_number = [string]$cells["A"]
            status          = [string]$cells["B"]
            issue_date      = if ($null -ne $saleDate) { $saleDate.ToString("yyyy-MM-dd") } else { "" }
            month_key       = if ($null -ne $saleDate) { $saleDate.ToString("yyyy-MM") } else { "" }
            customer        = [string]$cells["G"]
            city            = [string]$cells["H"]
            net_value       = [double]$net
            gross_value     = if ($null -ne (Convert-ToDecimalOrNull $cells["K"])) { [double](Convert-ToDecimalOrNull $cells["K"]) } else { 0.0 }
            category        = $category.Trim()
        })
    }

    $records | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "sales-invoices.json") -Encoding UTF8
    Write-Host "Sales sync complete. Records: $($records.Count)"
} finally {
    $zip.Dispose()
}
