param(
    [string]$RootDir = "C:\Users\kubaz\Documents\Codex\agent_excel_mvp"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$dataDir = Join-Path $RootDir "data"
$hoursAliasPath = Join-Path $RootDir "config\hours-aliases.json"
$salesAliasPath = Join-Path $RootDir "config\sales-aliases.json"

$PL_AOG = [string][char]261
$PL_EOG = [string][char]281
$PL_LOS = [string][char]322
$PL_NAC = [string][char]324
$PL_OAC = [string][char]243
$PL_ZAC = [string][char]378
$PL_ZDOT = [string][char]380

function Normalize-Name {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return "" }

    $normalized = $Name.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder
    foreach ($char in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }

    return ($builder.ToString().ToUpperInvariant() -replace "[^A-Z0-9]+", "")
}

function Load-Json {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    return @(Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Load-AliasMap {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $map }

    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($property in $json.PSObject.Properties) {
        $map[(Normalize-Name $property.Name)] = [string]$property.Value
    }
    return $map
}

function Get-MonthLabel {
    param([string]$MonthKey)
    if ([string]::IsNullOrWhiteSpace($MonthKey)) { return "" }

    $names = @{
        "01" = "Stycze${PL_NAC}"; "02" = "Luty"; "03" = "Marzec"; "04" = "Kwiecie${PL_NAC}";
        "05" = "Maj"; "06" = "Czerwiec"; "07" = "Lipiec"; "08" = "Sierpie${PL_NAC}";
        "09" = "Wrzesie${PL_NAC}"; "10" = "Pa${PL_ZAC}dziernik"; "11" = "Listopad"; "12" = "Grudzie${PL_NAC}"
    }
    $parts = $MonthKey.Split("-")
    if ($parts.Count -lt 2) { return $MonthKey }
    return "$MonthKey $($names[$parts[1]])".Trim()
}

function Resolve-MappedName {
    param(
        [string]$SourceName,
        [hashtable]$AliasMap,
        [hashtable]$KnownNames
    )
    $normalized = Normalize-Name $SourceName
    if ($AliasMap.ContainsKey($normalized)) {
        $aliasTarget = [string]$AliasMap[$normalized]
        $normalizedAliasTarget = Normalize-Name $aliasTarget
        if ($KnownNames.ContainsKey($normalizedAliasTarget)) {
            return $KnownNames[$normalizedAliasTarget]
        }
        return $aliasTarget
    }
    if ($KnownNames.ContainsKey($normalized)) { return $KnownNames[$normalized] }
    return $SourceName.Trim()
}

$investments = Load-Json -Path (Join-Path $dataDir "investments.json")
$invoices = Load-Json -Path (Join-Path $dataDir "invoices.json")
$materialMonthly = Load-Json -Path (Join-Path $dataDir "monthly-costs.json")
$laborMonthly = Load-Json -Path (Join-Path $dataDir "labor-monthly.json")
$salesInvoices = Load-Json -Path (Join-Path $dataDir "sales-invoices.json")

$hoursAliases = Load-AliasMap -Path $hoursAliasPath
$salesAliases = Load-AliasMap -Path $salesAliasPath

$knownInvestmentNames = @{}
foreach ($investment in $investments) {
    $knownInvestmentNames[(Normalize-Name $investment.investment_name)] = $investment.investment_name
}

$mappedLabor = New-Object System.Collections.Generic.List[object]
foreach ($row in $laborMonthly) {
    $mappedName = Resolve-MappedName -SourceName $row.source_name -AliasMap $hoursAliases -KnownNames $knownInvestmentNames
    $mappedLabor.Add([PSCustomObject]@{
        investment_name = $mappedName
        source_name     = $row.source_name
        month_key       = $row.month_key
        month_label     = $row.month_label
        labor_hours     = [double](@($row.labor_hours)[0])
        labor_cost      = [double](@($row.labor_cost)[0])
    })
}

$mappedSales = New-Object System.Collections.Generic.List[object]
foreach ($row in $salesInvoices) {
    $mappedName = Resolve-MappedName -SourceName $row.category -AliasMap $salesAliases -KnownNames $knownInvestmentNames
    $mappedSales.Add([PSCustomObject]@{
        investment_name = $mappedName
        source_category = $row.category
        month_key       = [string]$row.month_key
        sales_value     = [double](@($row.net_value)[0])
        document_number = [string]$row.document_number
        customer        = [string]$row.customer
    })
}

$invoiceCounts = @{}
foreach ($group in ($invoices | Group-Object investment_name)) {
    $invoiceCounts[$group.Name] = $group.Count
}

$materialNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($investment in $investments) {
    [void]$materialNames.Add([string]$investment.investment_name)
}

$allNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($name in $materialNames) { [void]$allNames.Add($name) }
foreach ($row in $mappedLabor) { [void]$allNames.Add([string]$row.investment_name) }
foreach ($row in $mappedSales) { [void]$allNames.Add([string]$row.investment_name) }

$investmentCards = New-Object System.Collections.Generic.List[object]

foreach ($investmentName in ($allNames | Sort-Object)) {
    $isMaterial = $materialNames.Contains($investmentName)
    $materialRows = @($materialMonthly | Where-Object { $_.investment_name -eq $investmentName } | Sort-Object month_number)
    $laborRows = @($mappedLabor | Where-Object { $_.investment_name -eq $investmentName } | Sort-Object month_key)
    $salesRows = @($mappedSales | Where-Object { $_.investment_name -eq $investmentName } | Sort-Object month_key)
    $monthMap = @{}

    foreach ($row in $materialRows) {
        $monthKey = "2025-{0:D2}" -f [int]$row.month_number
        $monthMap[$monthKey] = [ordered]@{
            month_key     = $monthKey
            month_label   = Get-MonthLabel -MonthKey $monthKey
            material_cost = [double]$row.total_cost
            labor_cost    = 0.0
            labor_hours   = 0.0
            sales         = 0.0
        }
    }

    foreach ($row in $laborRows) {
        if (-not $monthMap.ContainsKey($row.month_key)) {
            $monthMap[$row.month_key] = [ordered]@{
                month_key     = $row.month_key
                month_label   = if ($row.month_label) { $row.month_label } else { Get-MonthLabel -MonthKey $row.month_key }
                material_cost = 0.0
                labor_cost    = 0.0
                labor_hours   = 0.0
                sales         = 0.0
            }
        }
        $monthMap[$row.month_key].labor_cost += [double]$row.labor_cost
        $monthMap[$row.month_key].labor_hours += [double]$row.labor_hours
    }

    foreach ($row in $salesRows) {
        if ([string]::IsNullOrWhiteSpace($row.month_key)) { continue }
        if (-not $monthMap.ContainsKey($row.month_key)) {
            $monthMap[$row.month_key] = [ordered]@{
                month_key     = $row.month_key
                month_label   = Get-MonthLabel -MonthKey $row.month_key
                material_cost = 0.0
                labor_cost    = 0.0
                labor_hours   = 0.0
                sales         = 0.0
            }
        }
        $monthMap[$row.month_key].sales += [double]$row.sales_value
    }

    $monthlyBreakdown = @(
        $monthMap.GetEnumerator() |
        Sort-Object Name |
        ForEach-Object {
            $item = $_.Value
            $totalCost = [double]($item.material_cost + $item.labor_cost)
            [PSCustomObject]@{
                month_key     = $item.month_key
                month_label   = $item.month_label
                material_cost = [double]$item.material_cost
                labor_cost    = [double]$item.labor_cost
                labor_hours   = [double]$item.labor_hours
                sales         = [double]$item.sales
                total_cost    = $totalCost
                margin        = [double]($item.sales - $totalCost)
            }
        }
    )

    $materialCostTotal = if ($monthlyBreakdown.Count -gt 0) { [double](($monthlyBreakdown | Measure-Object material_cost -Sum).Sum) } else { 0.0 }
    $laborCostTotal = if ($monthlyBreakdown.Count -gt 0) { [double](($monthlyBreakdown | Measure-Object labor_cost -Sum).Sum) } else { 0.0 }
    $laborHoursTotal = if ($monthlyBreakdown.Count -gt 0) { [double](($monthlyBreakdown | Measure-Object labor_hours -Sum).Sum) } else { 0.0 }
    $salesTotal = if ($monthlyBreakdown.Count -gt 0) { [double](($monthlyBreakdown | Measure-Object sales -Sum).Sum) } else { 0.0 }
    $totalCost = $materialCostTotal + $laborCostTotal
    $margin = $salesTotal - $totalCost
    $marginPercent = if ($salesTotal -gt 0) { [math]::Round(($margin / $salesTotal) * 100, 2) } else { 0 }
    $laborShare = if ($totalCost -gt 0) { ($laborCostTotal / $totalCost) * 100 } else { 0 }
    $peakMonth = if ($monthlyBreakdown.Count -gt 0) { $monthlyBreakdown | Sort-Object total_cost -Descending | Select-Object -First 1 } else { $null }
    $bestMonth = if ($monthlyBreakdown.Count -gt 0) { $monthlyBreakdown | Sort-Object margin -Descending | Select-Object -First 1 } else { $null }

    $cardPrefix = if ($isMaterial) { "inv" } else { "synthetic" }
    $peakMonthLabel = if ($null -ne $peakMonth) { $peakMonth.month_label } else { "brak danych" }
    $peakMonthCost = if ($null -ne $peakMonth) { [double]$peakMonth.total_cost } else { 0.0 }
    $bestMonthLabel = if ($null -ne $bestMonth) { $bestMonth.month_label } else { "brak danych" }
    $bestMonthMargin = if ($null -ne $bestMonth) { [double]$bestMonth.margin } else { 0.0 }

    $investmentCards.Add([PSCustomObject]@{
        id                = ($cardPrefix + "-" + ($investmentName -replace "[^A-Za-z0-9]+", "-").Trim("-").ToLowerInvariant())
        name              = $investmentName
        material_cost     = $materialCostTotal
        labor_cost        = $laborCostTotal
        total_cost        = $totalCost
        labor_hours       = $laborHoursTotal
        sales             = $salesTotal
        margin            = $margin
        margin_percent    = $marginPercent
        invoice_count     = if ($invoiceCounts.ContainsKey($investmentName)) { $invoiceCounts[$investmentName] } else { 0 }
        mapping_status    = if ($isMaterial) { "mapped" } else { "synthetic" }
        monthly_breakdown = $monthlyBreakdown
        analyses          = @(
            "Najdro${PL_ZDOT}szy miesi${PL_AOG}c kosztowy: $peakMonthLabel z kosztem $([string]::Format('{0:N2}', $peakMonthCost)) PLN.",
            "Najlepszy miesi${PL_AOG}c mar${PL_ZDOT}owy: $bestMonthLabel z mar${PL_ZDOT}${PL_AOG} $([string]::Format('{0:N2}', $bestMonthMargin)) PLN.",
            "Sprzeda${PL_ZDOT}: $([string]::Format('{0:N2}', $salesTotal)) PLN, materia${PL_LOS}y: $([string]::Format('{0:N2}', $materialCostTotal)) PLN, robocizna: $([string]::Format('{0:N2}', $laborCostTotal)) PLN. Udzia${PL_LOS} robocizny: $([string]::Format('{0:N1}', $laborShare))%."
        )
    })
}

$totals = [PSCustomObject]@{
    investments_count = $investmentCards.Count
    invoices_count    = $invoices.Count
    total_material    = [double](($investmentCards | Measure-Object material_cost -Sum).Sum)
    total_labor       = [double](($investmentCards | Measure-Object labor_cost -Sum).Sum)
    total_cost        = [double](($investmentCards | Measure-Object total_cost -Sum).Sum)
    total_sales       = [double](($investmentCards | Measure-Object sales -Sum).Sum)
    total_margin      = [double](($investmentCards | Measure-Object margin -Sum).Sum)
}

$detailOrder = @($investmentCards | Sort-Object margin)
$alerts = @(
    $detailOrder |
    Where-Object { $_.margin -lt 0 -or ($_.sales -eq 0 -and $_.total_cost -gt 0) } |
    Select-Object -First 10 |
    ForEach-Object {
        $issues = @()
        if ($_.margin -lt 0) { $issues += "Ujemna mar${PL_ZDOT}a" }
        if ($_.sales -eq 0 -and $_.total_cost -gt 0) { $issues += "Koszt bez sprzeda${PL_ZDOT}y" }
        [PSCustomObject]@{
            investment_name = $_.name
            issues          = $issues
            margin_value    = $_.margin
        }
    }
)

$recommendations = @(
    $alerts |
    ForEach-Object { "Zweryfikuj inwestycj${PL_EOG} $($_.investment_name): $($_.issues -join ', ')." } |
    Select-Object -Unique
)

$unmatchedHours = @(
    $detailOrder |
    Where-Object { $_.mapping_status -eq "synthetic" -and $_.labor_cost -gt 0 } |
    Select-Object @{Name='source_name';Expression={$_.name}}, @{Name='entries';Expression={1}}, @{Name='labor_cost';Expression={$_.labor_cost}}
)

$topCostSuppliers = @(
    $invoices |
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
)

$topCustomers = @(
    $mappedSales |
    Group-Object customer |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
    ForEach-Object {
        [PSCustomObject]@{
            supplier = $_.Name
            total    = [double](($_.Group | Measure-Object sales_value -Sum).Sum)
            count    = $_.Count
        }
    } |
    Sort-Object total -Descending |
    Select-Object -First 10
)

$appData = [PSCustomObject]@{
    meta = [PSCustomObject]@{
        generated_at = (Get-Date).ToString("s")
        source_file  = "Koszty materia${PL_LOS}${PL_OAC}w + Zestawienie godzin + Plik sprzeda${PL_ZDOT} AGZ"
    }
    totals = $totals
    top_positive = $detailOrder | Sort-Object margin -Descending | Select-Object -First 5 @{Name='investment_name';Expression={$_.name}}, @{Name='material_cost';Expression={$_.material_cost}}, @{Name='sales_revenue';Expression={$_.sales}}, @{Name='margin_value';Expression={$_.margin}}
    top_negative = $detailOrder | Sort-Object margin | Select-Object -First 5 @{Name='investment_name';Expression={$_.name}}, @{Name='material_cost';Expression={$_.material_cost}}, @{Name='sales_revenue';Expression={$_.sales}}, @{Name='margin_value';Expression={$_.margin}}
    alerts = $alerts
    recommendations = $recommendations
    top_suppliers = $topCostSuppliers
    top_customers = $topCustomers
    investments = $detailOrder
    unmatched_hours = $unmatchedHours
}

$appData | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $dataDir "app-data.json") -Encoding UTF8
("window.APP_DATA = " + ($appData | ConvertTo-Json -Depth 12) + ";") | Set-Content -LiteralPath (Join-Path $dataDir "app-data.js") -Encoding UTF8
$mappedLabor | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $dataDir "labor-mapped.json") -Encoding UTF8
$mappedSales | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $dataDir "sales-mapped.json") -Encoding UTF8
$unmatchedHours | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dataDir "hours-unmatched.json") -Encoding UTF8

Write-Host "Merged app data built. Investments: $($investmentCards.Count)"
