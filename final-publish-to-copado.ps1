$ErrorActionPreference = "Stop"

# ============================================================
# PromotionProof - Final Clean + Validate + Publish to Copado
# ============================================================

$Root = "F:\Copado Hackton\promotion-proof-clean"
$Story = "US-0000025"
$ExpectedBranch = "feature/US-0000025"

$BadPluginFolder = Join-Path $Root "npm notice run salesforce-app@1.0.0 npx"

$FieldPath = Join-Path $Root "force-app\main\default\objects\Case\fields\Sub_Category__c.field-meta.xml"

$ApprovedValue = "API Failure Opt Out Exception"
$UnexpectedValue = "Account Information Category"

Set-Location $Root

Write-Host ""
Write-Host "============================================================"
Write-Host " PromotionProof - Final Copado Publish"
Write-Host "============================================================"
Write-Host ""

# ------------------------------------------------------------
# 1. Verify branch
# ------------------------------------------------------------

Write-Host "[1/10] Checking branch..."

$Branch = git branch --show-current

if ($Branch -ne $ExpectedBranch) {
    throw "Expected branch '$ExpectedBranch' but found '$Branch'."
}

Write-Host "OK: $Branch"
Write-Host ""

# ------------------------------------------------------------
# 2. Remove accidental plugin scaffold from this repo
# ------------------------------------------------------------

Write-Host "[2/10] Checking accidental plugin folder..."

if (Test-Path $BadPluginFolder) {

    $BackupName = "bad-plugin-scaffold-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $BackupPath = Join-Path "F:\Copado Hackton" $BackupName

    Write-Host "Accidental scaffold found."
    Write-Host "Moving it outside the repository to:"
    Write-Host $BackupPath

    Move-Item `
        -LiteralPath $BadPluginFolder `
        -Destination $BackupPath

    Write-Host "Accidental folder moved safely."
}
else {
    Write-Host "No accidental plugin folder found."
}

Write-Host ""

# ------------------------------------------------------------
# 3. Check repository cleanliness
# ------------------------------------------------------------

Write-Host "[3/10] Checking Git status..."

$GitStatus = git status --porcelain

if ($GitStatus) {
    Write-Host ""
    Write-Host "Repository is not clean:"
    git status --short
    Write-Host ""
    throw "Resolve or commit the files above before publishing."
}

Write-Host "Working tree is clean."
Write-Host ""

# ------------------------------------------------------------
# 4. Verify User Story
# ------------------------------------------------------------

Write-Host "[4/10] Verifying Copado User Story..."

agentia cicd work get $Story --json

if ($LASTEXITCODE -ne 0) {
    throw "Could not retrieve $Story."
}

Write-Host ""

# ------------------------------------------------------------
# 5. Re-bind Agentia to the User Story
# ------------------------------------------------------------

Write-Host "[5/10] Setting active User Story..."

agentia cicd work set $Story --json

if ($LASTEXITCODE -ne 0) {
    throw "agentia cicd work set failed."
}

$Branch = git branch --show-current

if ($Branch -ne $ExpectedBranch) {
    throw "Agentia switched to unexpected branch '$Branch'."
}

Write-Host ""

# ------------------------------------------------------------
# 6. Verify safe metadata state
# ------------------------------------------------------------

Write-Host "[6/10] Verifying Salesforce metadata..."

if (-not (Test-Path $FieldPath)) {
    throw "Metadata file missing: $FieldPath"
}

$Xml = Get-Content $FieldPath -Raw

if ($Xml -notmatch [regex]::Escape($ApprovedValue)) {
    throw "Approved value '$ApprovedValue' is missing."
}

if ($Xml -match [regex]::Escape($UnexpectedValue)) {
    throw "BLOCKED: Unauthorized value '$UnexpectedValue' is still present."
}

Write-Host "Approved:"
Write-Host "  + $ApprovedValue"

Write-Host "Unauthorized value absent:"
Write-Host "  - $UnexpectedValue"

Write-Host ""

# ------------------------------------------------------------
# 7. Run PromotionProof directly
# ------------------------------------------------------------

Write-Host "[7/10] Running PromotionProof quality gate..."

if (-not (Test-Path ".\.agentia_quality_gates.cmd")) {
    throw ".agentia_quality_gates.cmd is missing."
}

& ".\.agentia_quality_gates.cmd"

$GateExit = $LASTEXITCODE

if ($GateExit -ne 0) {
    throw "PromotionProof blocked publication. Exit code: $GateExit"
}

Write-Host ""
Write-Host "PromotionProof: PASS"
Write-Host ""

# ------------------------------------------------------------
# 8. Run through Agentia
# ------------------------------------------------------------

Write-Host "[8/10] Running Agentia local quality gates..."

agentia cicd work test --local

$TestExit = $LASTEXITCODE

if ($TestExit -ne 0) {
    throw "Agentia local test failed. Exit code: $TestExit"
}

Write-Host ""
Write-Host "Agentia local test: PASS"
Write-Host ""

# ------------------------------------------------------------
# 9. Publish commits to Copado
# ------------------------------------------------------------

Write-Host "============================================================"
Write-Host "[9/10] READY TO PUBLISH"
Write-Host "============================================================"
Write-Host ""
Write-Host "User Story : $Story"
Write-Host "Branch     : $ExpectedBranch"
Write-Host ""
Write-Host "This operation will:"
Write-Host "  1. Push feature/US-0000025 to GitHub"
Write-Host "  2. Register the commits against US-0000025 in Copado"
Write-Host "  3. Register Salesforce metadata changes"
Write-Host "  4. Merge the feature branch into the Dev1 branch"
Write-Host ""
Write-Host "It will NOT submit the User Story to INT."
Write-Host "It will NOT promote to UAT or Production."
Write-Host ""

$Confirm = Read-Host "Type PUBLISH to continue"

if ($Confirm -ne "PUBLISH") {
    throw "Publish cancelled."
}

Write-Host ""
Write-Host "Publishing..."
Write-Host ""

agentia cicd work publish

$PublishExit = $LASTEXITCODE

if ($PublishExit -ne 0) {
    throw "agentia cicd work publish failed. Exit code: $PublishExit"
}

Write-Host ""
Write-Host "Publish completed successfully."
Write-Host ""

# ------------------------------------------------------------
# 10. Final verification
# ------------------------------------------------------------

Write-Host "============================================================"
Write-Host "[10/10] FINAL VERIFICATION"
Write-Host "============================================================"
Write-Host ""

Write-Host "User Story status:"
agentia cicd work status $Story --json

Write-Host ""
Write-Host "Current branch:"
git branch --show-current

Write-Host ""
Write-Host "Working tree:"
git status

Write-Host ""
Write-Host "Remote feature branch:"
git ls-remote --heads origin $ExpectedBranch

Write-Host ""
Write-Host "Recent feature commits:"
git log --oneline --decorate -10

Write-Host ""
Write-Host "Remote Dev1 commits:"
git fetch origin
git log origin/dev1-sfp --oneline -10

Write-Host ""
Write-Host "============================================================"
Write-Host " SUCCESS"
Write-Host ""
Write-Host " PromotionProof commits were published through Agentia."
Write-Host ""
Write-Host " Now open Copado:"
Write-Host " US-0000025"
Write-Host ""
Write-Host " Refresh the User Story and check:"
Write-Host "   - Commits"
Write-Host "   - Changes / Metadata"
Write-Host "   - related jobs if available"
Write-Host ""
Write-Host " DO NOT run work submit yet."
Write-Host "============================================================"