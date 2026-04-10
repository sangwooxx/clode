param(
    [string]$ExcelPath = "",
    [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = Split-Path -Parent $projectRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "data"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Get-ColumnLetters {
    param([string]$CellRef)
    if ($CellRef -match "^[A-Z]+") {
        return $Matches[0]
    }
    return ""
}

function Get-CellValue {
    param(
        [Parameter(Mandatory = $true)]$Cell,
        [string[]]$SharedStrings
    )

    if ($null -eq $Cell) { return "" }

    $cellType = if ($Cell.PSObject.Properties["t"]) { [string]$Cell.t } else { "" }
    $cellValue = if ($Cell.PSObject.Properties["v"]) { $Cell.v } else { $null }
    $inlineValue = if ($Cell.PSObject.Properties["is"]) { $Cell.is } else { $null }

    if ($cellType -eq "s" -and $null -ne $cellValue) {
        return [string]$SharedStrings[[int]$cellValue]
    }

    if ($cellType -eq "inlineStr" -and $null -ne $inlineValue) {
        if ($inlineValue.PSObject.Properties["t"]) { return [string]$inlineValue.t }
        if ($inlineValue.PSObject.Properties["r"]) { return (($inlineValue.r | ForEach-Object { $_.t }) -join "") }
    }

    if ($null -ne $inlineValue) {
        if ($inlineValue.PSObject.Properties["t"]) { return [string]$inlineValue.t }
        if ($inlineValue.PSObject.Properties["r"]) { return (($inlineValue.r | ForEach-Object { $_.t }) -join "") }
    }

    if ($null -ne $cellValue) { return [string]$cellValue }
    return ""
}

function Convert-ToDecimalOrNull {
    param([object]$Value)

    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }

    $text = $text.Replace([char]160, " ")
    $text = $text.Replace("zł", "")
    $text = $text.Replace("PLN", "")
    $text = $text.Replace(" ", "")

    if ($text -match "^-?\d+(\.\d+)?$") {
        return [decimal]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    }

    $text = $text.Replace(".", "")
    $text = $text.Replace(",", ".")
    if ($text -match "^-?\d+(\.\d+)?$") {
        return [decimal]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    }

    return $null
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

function Get-SheetMap {
    param([System.IO.Compression.ZipArchive]$Zip)

    [xml]$workbook = Read-ZipText -Zip $Zip -EntryName "xl/workbook.xml"
    [xml]$rels = Read-ZipText -Zip $Zip -EntryName "xl/_rels/workbook.xml.rels"

    $sheetMap = @()
    foreach ($sheet in $workbook.workbook.sheets.sheet) {
        $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
        $rel = $rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid } | Select-Object -First 1
        if ($null -eq $rel) { continue }
        $sheetMap += [PSCustomObject]@{
            Name   = [string]$sheet.name
            Target = "xl/$($rel.Target)"
        }
    }
    return $sheetMap
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

function Parse-SummarySheet {
    param([hashtable]$Rows)

    $items = New-Object System.Collections.Generic.List[object]
    $blocks = @(
        @{ Name = "B"; Cost = "C"; Revenue = "D"; Delta = "E" },
        @{ Name = "H"; Cost = "I"; Revenue = "J"; Delta = "K" }
    )

    foreach ($rowNumber in 4..80) {
        if (-not $Rows.ContainsKey($rowNumber)) { continue }
        $row = $Rows[$rowNumber]
        foreach ($block in $blocks) {
            $name = [string]($row[$block.Name])
            if (
                [string]::IsNullOrWhiteSpace($name) -or
                $name -eq "Inwestycja" -or
                $name -eq "0" -or
                $name.ToLowerInvariant() -eq "suma:"
            ) { continue }

            $cost = Convert-ToDecimalOrNull $row[$block.Cost]
            $revenue = Convert-ToDecimalOrNull $row[$block.Revenue]
            $delta = Convert-ToDecimalOrNull $row[$block.Delta]
            $slug = ($name -replace "[^A-Za-z0-9]+", "-").Trim("-").ToLowerInvariant()
            $margin = if ($null -ne $delta) { [double]$delta } else { [double]((if ($null -ne $revenue) { $revenue } else { 0 }) - (if ($null -ne $cost) { $cost } else { 0 })) }

            $items.Add([PSCustomObject]@{
                id              = "inv-$slug"
                investment_name = $name.Trim()
                material_cost   = if ($null -ne $cost) { [double]$cost } else { 0.0 }
                sales_revenue   = if ($null -ne $revenue) { [double]$revenue } else { 0.0 }
                margin_value    = $margin
            })
        }
    }

    return $items
}

function Parse-InvestmentSheet {
    param(
        [string]$SheetName,
        [hashtable]$Rows
    )

    $investmentName = [string]($Rows[1]["B"])
    if ([string]::IsNullOrWhiteSpace($investmentName)) {
        return [PSCustomObject]@{
            Invoices = @()
            MonthlyTotals = @()
        }
    }

    $monthBlocks = @(
        @{ MonthNumber = 1; MonthName = "Styczen"; Company = "D"; Invoice = "E"; Amount = "F" },
        @{ MonthNumber = 2; MonthName = "Luty"; Company = "H"; Invoice = "I"; Amount = "J" },
        @{ MonthNumber = 3; MonthName = "Marzec"; Company = "L"; Invoice = "M"; Amount = "N" },
        @{ MonthNumber = 4; MonthName = "Kwiecien"; Company = "P"; Invoice = "Q"; Amount = "R" },
        @{ MonthNumber = 5; MonthName = "Maj"; Company = "T"; Invoice = "U"; Amount = "V" },
        @{ MonthNumber = 6; MonthName = "Czerwiec"; Company = "X"; Invoice = "Y"; Amount = "Z" },
        @{ MonthNumber = 7; MonthName = "Lipiec"; Company = "AB"; Invoice = "AC"; Amount = "AD" },
        @{ MonthNumber = 8; MonthName = "Sierpien"; Company = "AF"; Invoice = "AG"; Amount = "AH" },
        @{ MonthNumber = 9; MonthName = "Wrzesien"; Company = "AJ"; Invoice = "AK"; Amount = "AL" },
        @{ MonthNumber = 10; MonthName = "Pazdziernik"; Company = "AN"; Invoice = "AO"; Amount = "AP" },
        @{ MonthNumber = 11; MonthName = "Listopad"; Company = "AR"; Invoice = "AS"; Amount = "AT" },
        @{ MonthNumber = 12; MonthName = "Grudzien"; Company = "AV"; Invoice = "AW"; Amount = "AX" }
    )

    $monthlyTotals = New-Object System.Collections.Generic.List[object]
    $invoices = New-Object System.Collections.Generic.List[object]
    $slug = ($investmentName -replace "[^A-Za-z0-9]+", "-").Trim("-").ToLowerInvariant()

    foreach ($block in $monthBlocks) {
        $summaryRow = 4 + $block.MonthNumber
        $summaryValue = $null
        if ($Rows.ContainsKey($summaryRow)) {
            $summaryValue = Convert-ToDecimalOrNull $Rows[$summaryRow]["B"]
        }

        $monthlyTotals.Add([PSCustomObject]@{
            investment_name = $investmentName
            month_number    = $block.MonthNumber
            month_name      = $block.MonthName
            total_cost      = if ($null -ne $summaryValue) { [double]$summaryValue } else { 0.0 }
        })

        foreach ($rowNumber in 5..120) {
            if (-not $Rows.ContainsKey($rowNumber)) { continue }

            $row = $Rows[$rowNumber]
            $company = [string]($row[$block.Company])
            $invoiceNo = [string]($row[$block.Invoice])
            $amount = Convert-ToDecimalOrNull $row[$block.Amount]

            if ([string]::IsNullOrWhiteSpace($company) -and [string]::IsNullOrWhiteSpace($invoiceNo) -and $null -eq $amount) {
                continue
            }

            $invoiceId = "{0}-{1:D2}-{2:D3}" -f $slug, $block.MonthNumber, $rowNumber
            $invoices.Add([PSCustomObject]@{
                id              = $invoiceId
                investment_name = $investmentName
                source_sheet    = $SheetName
                month_number    = $block.MonthNumber
                month_name      = $block.MonthName
                supplier        = $company.Trim()
                invoice_number  = $invoiceNo.Trim()
                amount_net      = if ($null -ne $amount) { [double]$amount } else { 0.0 }
                row_number      = $rowNumber
            })
        }
    }

    return [PSCustomObject]@{
        Invoices = $invoices
        MonthlyTotals = $monthlyTotals
    }
}

function Build-AppData {
    param(
        [object[]]$Investments,
        [object[]]$Invoices,
        [object[]]$MonthlyTotals,
        [datetime]$GeneratedAt,
        [string]$SourcePath
    )

    $invoiceCounts = @{}
    foreach ($group in ($Invoices | Group-Object investment_name)) {
        $invoiceCounts[$group.Name] = $group.Count
    }

    $alerts = New-Object System.Collections.Generic.List[object]
    foreach ($investment in $Investments) {
        $issues = New-Object System.Collections.Generic.List[string]
        if ($investment.sales_revenue -le 0 -and $investment.material_cost -gt 0) { $issues.Add("Koszty bez sprzedazy") }
        if ($investment.margin_value -lt 0) { $issues.Add("Ujemna marza") }
        if ($investment.sales_revenue -gt 0) {
            $marginPercent = ($investment.margin_value / $investment.sales_revenue) * 100
            if ($marginPercent -lt 10) { $issues.Add("Niska marza") }
        }

        $investmentMonthly = @($MonthlyTotals | Where-Object { $_.investment_name -eq $investment.investment_name } | Sort-Object month_number)
        if ($investmentMonthly.Count -ge 2) {
            $latest = [double]$investmentMonthly[-1].total_cost
            $previous = [double]$investmentMonthly[-2].total_cost
            if ($previous -gt 0 -and $latest -gt ($previous * 1.2)) {
                $issues.Add("Szybki wzrost kosztow m/m")
            }
        }

        if ($issues.Count -gt 0) {
            $alerts.Add([PSCustomObject]@{
                investment_name = $investment.investment_name
                issues          = $issues
                margin_value    = $investment.margin_value
            })
        }
    }

    $recommendations = @()
    foreach ($alert in ($alerts | Sort-Object margin_value | Select-Object -First 8)) {
        if ($alert.issues -contains "Koszty bez sprzedazy") {
            $recommendations += "Zweryfikuj inwestycje $($alert.investment_name) - sa koszty materialow, ale brak sprzedazy w zestawieniu."
        }
        if ($alert.issues -contains "Ujemna marza") {
            $recommendations += "Sprawdz rentownosc inwestycji $($alert.investment_name) i przygotuj plan korekty marzy."
        }
        if ($alert.issues -contains "Niska marza") {
            $recommendations += "Inwestycja $($alert.investment_name) ma niska marze - warto przeanalizowac strukture kosztow."
        }
        if ($alert.issues -contains "Szybki wzrost kosztow m/m") {
            $recommendations += "Na inwestycji $($alert.investment_name) koszty rosna szybciej niz zwykle - sprawdz ostatnie faktury."
        }
    }
    $recommendations = $recommendations | Select-Object -Unique

    $investmentCards = $Investments | ForEach-Object {
        $item = $_
        $monthly = @($MonthlyTotals | Where-Object { $_.investment_name -eq $item.investment_name } | Sort-Object month_number)
        [PSCustomObject]@{
            id             = $item.id
            name           = $item.investment_name
            cost           = $item.material_cost
            sales          = $item.sales_revenue
            margin         = $item.margin_value
            margin_percent = if ($item.sales_revenue -gt 0) { [math]::Round(($item.margin_value / $item.sales_revenue) * 100, 2) } else { 0 }
            invoice_count  = if ($invoiceCounts.ContainsKey($item.investment_name)) { $invoiceCounts[$item.investment_name] } else { 0 }
            monthly_costs  = $monthly
        }
    }

    return [PSCustomObject]@{
        meta = [PSCustomObject]@{
            generated_at = $GeneratedAt.ToString("s")
            source_file  = $SourcePath
        }
        totals = [PSCustomObject]@{
            investments_count = ($Investments | Measure-Object).Count
            invoices_count    = ($Invoices | Measure-Object).Count
            total_cost        = [double](($Investments | Measure-Object material_cost -Sum).Sum)
            total_sales       = [double](($Investments | Measure-Object sales_revenue -Sum).Sum)
            total_margin      = [double](($Investments | Measure-Object margin_value -Sum).Sum)
        }
        top_positive = $Investments | Sort-Object margin_value -Descending | Select-Object -First 5
        top_negative = $Investments | Sort-Object margin_value | Select-Object -First 5
        alerts = $alerts | Sort-Object margin_value
        recommendations = $recommendations
        top_suppliers = $Invoices |
            Group-Object supplier |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
            ForEach-Object {
                [PSCustomObject]@{
                    supplier = $_.Name
                    total    = [double](($_.Group | Measure-Object amount_net -Sum).Sum)
                    count    = $_.Count
                }
            } |
            Sort-Object total -Descending |
            Select-Object -First 10
        investments = $investmentCards | Sort-Object margin
        monthly_costs = $MonthlyTotals
    }
}

Ensure-Directory -Path $OutputDir

if ([string]::IsNullOrWhiteSpace($ExcelPath)) {
    $match = Get-ChildItem -LiteralPath $workspaceRoot -Filter "*.xlsx" |
        Where-Object { $_.Name -like "*2025*kopia*.xlsx" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $match) {
        throw "No matching Excel copy found in workspace."
    }

    $ExcelPath = $match.FullName
}

if (-not (Test-Path -LiteralPath $ExcelPath)) {
    throw "Excel file not found: $ExcelPath"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($ExcelPath)
try {
    $sharedStrings = Get-SharedStrings -Zip $zip
    $sheetMap = Get-SheetMap -Zip $zip

    $summarySheet = $sheetMap | Where-Object { $_.Name -eq "Zestawienie" } | Select-Object -First 1
    if ($null -eq $summarySheet) {
        throw "Sheet 'Zestawienie' not found."
    }

    $summaryRows = Get-SheetRows -Zip $zip -EntryName $summarySheet.Target -SharedStrings $sharedStrings
    $investments = Parse-SummarySheet -Rows $summaryRows

    $invoiceSheets = $sheetMap | Where-Object { $_.Name -ne "Zestawienie" }
    $allInvoices = New-Object System.Collections.Generic.List[object]
    $allMonthlyTotals = New-Object System.Collections.Generic.List[object]

    foreach ($sheet in $invoiceSheets) {
        $rows = Get-SheetRows -Zip $zip -EntryName $sheet.Target -SharedStrings $sharedStrings
        $parsed = Parse-InvestmentSheet -SheetName $sheet.Name -Rows $rows
        foreach ($invoice in $parsed.Invoices) { $allInvoices.Add($invoice) }
        foreach ($monthly in $parsed.MonthlyTotals) { $allMonthlyTotals.Add($monthly) }
    }

    $generatedAt = Get-Date
    $appData = Build-AppData -Investments $investments -Invoices $allInvoices -MonthlyTotals $allMonthlyTotals -GeneratedAt $generatedAt -SourcePath $ExcelPath

    $investments | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "investments.json") -Encoding UTF8
    $allInvoices | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "invoices.json") -Encoding UTF8
    $allMonthlyTotals | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "monthly-costs.json") -Encoding UTF8
    $appData | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDir "app-data.json") -Encoding UTF8
    ("window.APP_DATA = " + ($appData | ConvertTo-Json -Depth 8) + ";") | Set-Content -LiteralPath (Join-Path $OutputDir "app-data.js") -Encoding UTF8

    [PSCustomObject]@{
        generated_at = $generatedAt
        source       = $ExcelPath
        investments  = ($investments | Measure-Object).Count
        invoices     = ($allInvoices | Measure-Object).Count
        output_dir   = $OutputDir
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir "sync-status.json") -Encoding UTF8

    Write-Host "Sync complete."
    Write-Host "Investments: $($investments.Count)"
    Write-Host "Invoices: $($allInvoices.Count)"
    Write-Host "Output: $OutputDir"
} finally {
    $zip.Dispose()
}
