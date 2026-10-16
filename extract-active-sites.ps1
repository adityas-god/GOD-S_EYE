# ==============================================================================
# GreyOrange Salesforce - Active Sites Extractor (PowerShell)
# ==============================================================================

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$InstanceUrl = if ($env:SF_INSTANCE_URL) { $env:SF_INSTANCE_URL } else { "https://greyorangeorg.my.salesforce.com" }
$ClientId    = if ($env:SF_CLIENT_ID) { $env:SF_CLIENT_ID } else { "" }
$ClientSecret = if ($env:SF_CLIENT_SECRET) { $env:SF_CLIENT_SECRET } else { "" }
$ApiVersion   = "v59.0"

# Read .env if present to override credentials
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $k = $parts[0].Trim()
            $v = $parts[1].Trim().Trim('"').Trim("'")
            if ($k -eq "SF_INSTANCE_URL" -and $v) { $InstanceUrl = $v }
            if ($k -eq "SF_CLIENT_ID" -and $v) { $ClientId = $v }
            if ($k -eq "SF_CLIENT_SECRET" -and $v) { $ClientSecret = $v }
        }
    }
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " GreyOrange Salesforce - Active Sites Extractor" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Authenticate with Salesforce
Write-Host "`n[1/4] Authenticating with GreyOrange Salesforce ($InstanceUrl)..." -ForegroundColor Yellow
$tokenUrl = "$InstanceUrl/services/oauth2/token"
$authBody = @{
    grant_type    = "client_credentials"
    client_id     = $ClientId
    client_secret = $ClientSecret
}

try {
    $authResp = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $authBody -ContentType "application/x-www-form-urlencoded"
    $Token = $authResp.access_token
    Write-Host "[OK] Authentication successful!" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
}

# 2. Inspect Account Schema for Decommission / Status fields
Write-Host "`n[2/4] Inspecting Account fields in GreyOrange Salesforce..." -ForegroundColor Yellow
$describeUrl = "$InstanceUrl/services/data/$ApiVersion/sobjects/Account/describe"
$availableFields = @("Id", "Name", "Type", "BillingCity", "BillingState", "BillingCountry")

try {
    $describeResp = Invoke-RestMethod -Uri $describeUrl -Method Get -Headers $headers
    $allFieldNames = $describeResp.fields | ForEach-Object { $_.name }

    $candidateFields = @("Status__c", "Account_Status__c", "Site_Status__c", "Active__c", "Is_Active__c", "Decommissioned__c", "Customer_Status__c", "Operating_Status__c")
    foreach ($f in $candidateFields) {
        if ($allFieldNames -contains $f) {
            $availableFields += $f
        }
    }
    Write-Host "[OK] Detected fields: $($availableFields -join ', ')" -ForegroundColor Green
} catch {
    Write-Host "[NOTE] Using standard fields: $($availableFields -join ', ')" -ForegroundColor Gray
}

# 3. Query All Accounts
Write-Host "`n[3/4] Querying all accounts from Salesforce..." -ForegroundColor Yellow
$fieldsQuery = $availableFields -join ", "
$soql = "SELECT $fieldsQuery FROM Account WHERE Name != null ORDER BY Name LIMIT 1000"
$queryUrl = "$InstanceUrl/services/data/$ApiVersion/query?q=" + [System.Uri]::EscapeDataString($soql)

$accResp = Invoke-RestMethod -Uri $queryUrl -Method Get -Headers $headers
$records = $accResp.records
Write-Host "[OK] Retrieved $($records.Count) account records from Salesforce." -ForegroundColor Green

# 4. Filter Active Non-Decommissioned Sites
Write-Host "`n[4/4] Filtering active non-decommissioned sites..." -ForegroundColor Yellow

$noisePattern = "^(greyorange|greyorange internal|test\b|sample|dummy)"
$activeSites = @()
$decommissionedSites = @()

foreach ($acc in $records) {
    $name = ($acc.Name + "").Trim()
    if (-not $name -or $name -match $noisePattern) { continue }

    $isDecom = $false
    $decomReason = ""

    # Check all fields on the account record for decommission / inactive markers
    $props = $acc.psobject.Properties
    foreach ($p in $props) {
        $pName = $p.Name.ToLower()
        $pVal = ($p.Value + "").Trim().ToLower()

        if ($pName.Contains("decommission")) {
            if ($p.Value -eq $true -or $pVal -eq "true" -or $pVal -eq "yes" -or $pVal -eq "decommissioned") {
                $isDecom = $true
                $decomReason = "$($p.Name)=$($p.Value)"
                break
            }
        }
        if ($pName.Contains("status")) {
            if ($pVal.Contains("decommission") -or $pVal.Contains("inactive") -or $pVal.Contains("terminated") -or $pVal.Contains("churned") -or $pVal.Contains("closed")) {
                $isDecom = $true
                $decomReason = "$($p.Name)=$($p.Value)"
                break
            }
        }
        if ($pName.Contains("active") -and -not $pName.Contains("interactive")) {
            if ($p.Value -eq $false -or $pVal -eq "false" -or $pVal -eq "no") {
                $isDecom = $true
                $decomReason = "$($p.Name)=$($p.Value)"
                break
            }
        }
    }

    $locationParts = @($acc.BillingCity, $acc.BillingState, $acc.BillingCountry) | Where-Object { $_ }
    $locationStr = if ($locationParts.Count -gt 0) { $locationParts -join ", " } else { "N/A" }

    $siteItem = [PSCustomObject]@{
        Name      = $acc.Name
        AccountId = $acc.Id
        Type      = if ($acc.Type) { $acc.Type } else { "Customer" }
        Location  = $locationStr
    }

    if ($isDecom) {
        $decommissionedSites += [PSCustomObject]@{
            Name      = $acc.Name
            AccountId = $acc.Id
            Reason    = $decomReason
        }
    } else {
        $activeSites += $siteItem
    }
}

# Sort alphabetically
$activeSites = $activeSites | Sort-Object Name

# Display in Table
Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host " ACTIVE SITES IN GREYORANGE (NOT DECOMMISSIONED) - COUNT: $($activeSites.Count)" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

$activeSites | Select-Object @{Name="No."; Expression={$global:i++; $global:i}}, Name, AccountId, Location | Format-Table -AutoSize

if ($decommissionedSites.Count -gt 0) {
    Write-Host "`n======================================================================" -ForegroundColor Red
    Write-Host " DECOMMISSIONED / INACTIVE SITES FILTERED OUT: $($decommissionedSites.Count)" -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    $decommissionedSites | Format-Table -AutoSize
}

# Save Output Files
$jsonFile = Join-Path (Get-Location) "active_salesforce_sites.json"
$txtFile  = Join-Path (Get-Location) "active_salesforce_sites.txt"

$activeSites | ConvertTo-Json -Depth 4 | Out-File -FilePath $jsonFile -Encoding utf8
$activeSites.Name | Out-File -FilePath $txtFile -Encoding utf8

Write-Host "`n[OK] Results saved to:" -ForegroundColor Green
Write-Host "     - JSON Details: $jsonFile" -ForegroundColor White
Write-Host "     - Exact Names : $txtFile" -ForegroundColor White
Write-Host "======================================================================`n" -ForegroundColor Cyan
