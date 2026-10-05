param(
    [string]$BaseRef = "origin/main",
    [string]$HeadRef = "HEAD"
)

$ErrorActionPreference = "Stop"

$FieldPath = "force-app/main/default/objects/Case/fields/Sub_Category__c.field-meta.xml"
$ContractPath = ".promotion-proof/contracts/US-0000025.json"
$ReportPath = ".promotion-proof/reports/latest.json"

if (-not (Test-Path $ContractPath)) {
    Write-Host "PROMOTIONPROOF VERDICT: ERROR"
    Write-Host "Contract not found: $ContractPath"
    exit 3
}

$contract = Get-Content $ContractPath -Raw | ConvertFrom-Json

$baseXml = git show "${BaseRef}:$FieldPath" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "PROMOTIONPROOF VERDICT: ERROR"
    Write-Host "Unable to read baseline metadata from $BaseRef"
    exit 3
}

$headXml = Get-Content $FieldPath -Raw

function Get-PicklistValues {
    param([string]$XmlText)

    $matches = [regex]::Matches(
        $XmlText,
        '<value>\s*<fullName>(.*?)</fullName>',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    return @(
        foreach ($match in $matches) {
            $match.Groups[1].Value.Trim()
        }
    )
}

$baseValues = Get-PicklistValues $baseXml
$headValues = Get-PicklistValues $headXml

$addedValues = @(
    $headValues | Where-Object { $_ -notin $baseValues }
)

$removedValues = @(
    $baseValues | Where-Object { $_ -notin $headValues }
)

$allowedAdds = @($contract.allowedPicklistAdds)

$unexpectedAdds = @(
    $addedValues | Where-Object { $_ -notin $allowedAdds }
)

$findings = @()

foreach ($value in $unexpectedAdds) {
    $findings += [pscustomobject]@{
        ruleId      = "PP-SCOPE-001"
        severity    = "error"
        operation   = "add"
        component   = $contract.component
        identity    = $value
        explanation = "Picklist value is not included in the approved Change Contract."
        remediation = "Remove the value or obtain explicit approval in a separate User Story."
    }
}

foreach ($value in $removedValues) {
    $findings += [pscustomobject]@{
        ruleId      = "PP-DESTRUCTIVE-001"
        severity    = "error"
        operation   = "remove"
        component   = $contract.component
        identity    = $value
        explanation = "Existing picklist value was removed without approval."
        remediation = "Restore the value or explicitly approve the destructive change."
    }
}

$verdict = if ($findings.Count -gt 0) { "BLOCK" } else { "PASS" }
$exitCode = if ($verdict -eq "PASS") { 0 } else { 2 }

$report = [pscustomobject]@{
    schemaVersion  = 1
    story          = $contract.story
    component      = $contract.component
    baseRef        = $BaseRef
    headRef        = $HeadRef
    baseValues     = $baseValues
    headValues     = $headValues
    addedValues    = $addedValues
    removedValues  = $removedValues
    unexpectedAdds = $unexpectedAdds
    findings       = $findings
    verdict        = $verdict
}

$report |
    ConvertTo-Json -Depth 10 |
    Set-Content $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "============================================================"
Write-Host " PromotionProof"
Write-Host "============================================================"
Write-Host ""
Write-Host "Story     :" $contract.story.name
Write-Host "Component :" $contract.component
Write-Host ""
Write-Host "Approved semantic additions:"
foreach ($value in $allowedAdds) {
    Write-Host "  + $value"
}

Write-Host ""
Write-Host "Actual semantic additions:"
foreach ($value in $addedValues) {
    Write-Host "  + $value"
}

if ($removedValues.Count -gt 0) {
    Write-Host ""
    Write-Host "Removed values:"
    foreach ($value in $removedValues) {
        Write-Host "  - $value"
    }
}

if ($findings.Count -gt 0) {
    Write-Host ""
    Write-Host "Findings:"

    foreach ($finding in $findings) {
        Write-Host ""
        Write-Host $finding.ruleId "-" $finding.explanation
        Write-Host "Component :" $finding.component
        Write-Host "Operation :" $finding.operation
        Write-Host "Value     :" $finding.identity
        Write-Host "Fix       :" $finding.remediation
    }
}

Write-Host ""
Write-Host "PROMOTIONPROOF VERDICT: $verdict"
Write-Host ""

exit $exitCode
