$ErrorActionPreference = "Stop"

# ============================================================
# PromotionProof - Validate + Publish Commits to Copado User Story
# User Story: US-0000025
# ============================================================

$Root = "F:\Copado Hackton\promotion-proof-clean"
$Story = "US-0000025"
$ExpectedBranch = "feature/US-0000025"

$FieldPath = "force-app/main/default/objects/Case/fields/Sub_Category__c.field-meta.xml"
$ApprovedValue = "API Failure Opt Out Exception"
$UnexpectedValue = "Account Information Category"

Set-Location $Root

Write-Host ""
Write-Host "============================================================"
Write-Host " PromotionProof - Copado Publish"
Write-Host "============================================================"
Write-Host ""

# ------------------------------------------------------------
# 1. Verify Git branch
# ------------------------------------------------------------

Write-Host "[1/9] Checking Git branch..."

$branch = git branch --show-current

if ($branch -ne $ExpectedBranch) {
    throw "Wrong branch. Expected '$ExpectedBranch' but found '$branch'."
}

Write-Host "Branch: $branch"
Write-Host ""

# ------------------------------------------------------------
# 2. Verify working tree is clean
# ------------------------------------------------------------

Write-Host "[2/9] Checking working tree..."

$status = git status --porcelain

if ($status) {
    Write-Host ""
    Write-Host "Working tree is NOT clean:"
    git status --short

    throw "Commit or restore the files above before publishing."
}

Write-Host "Working tree is clean."
Write-Host ""

# ------------------------------------------------------------
# 3. Verify User Story in Copado
# ------------------------------------------------------------

Write-Host "[3/9] Verifying Copado User Story..."

agentia cicd work get $Story --json

if ($LASTEXITCODE -ne 0) {
    throw "Unable to retrieve $Story from Copado."
}

Write-Host ""

# ------------------------------------------------------------
# 4. Re-establish Agentia active work context
# ------------------------------------------------------------

Write-Host "[4/9] Setting active Agentia work item..."

agentia cicd work set $Story --json

if ($LASTEXITCODE -ne 0) {
    throw "Unable to set active User Story."
}

$branch = git branch --show-current

if ($branch -ne $ExpectedBranch) {
    throw "Agentia did not leave us on expected feature branch."
}

Write-Host ""

# ------------------------------------------------------------
# 5. Verify approved Salesforce metadata
# ------------------------------------------------------------

Write-Host "[5/9] Checking Salesforce metadata..."

if (-not (Test-Path $FieldPath)) {
    throw "Metadata file does not exist: $FieldPath"
}

$xml = Get-Content $FieldPath -Raw

if ($xml -notmatch [regex]::Escape($ApprovedValue)) {
    throw "Approved value '$ApprovedValue' is missing."
}

if ($xml -match [regex]::Escape($UnexpectedValue)) {
    throw "BLOCKED: Unauthorized value '$UnexpectedValue' is still present."
}

Write-Host "Approved value present:"
Write-Host "  + $ApprovedValue"

Write-Host "Unexpected value absent:"
Write-Host "  - $UnexpectedValue"

Write-Host ""

# ------------------------------------------------------------
# 6. Run PromotionProof quality gate directly
# ------------------------------------------------------------

Write-Host "[6/9] Running PromotionProof quality gate..."

if (-not (Test-Path ".agentia_quality_gates.cmd")) {
    throw ".agentia_quality_gates.cmd is missing."
}

& ".\.agentia_quality_gates.cmd"

$gateExit = $LASTEXITCODE

if ($gateExit -ne 0) {
    throw "PromotionProof BLOCKED publish. Exit code: $gateExit"
}

Write-Host ""
Write-Host "PromotionProof result: PASS"
Write-Host ""

# ------------------------------------------------------------
# 7. Run through Agentia local work-test workflow
# ------------------------------------------------------------

Write-Host "[7/9] Running Agentia local test..."

agentia cicd work test --local

$testExit = $LASTEXITCODE

if ($testExit -ne 0) {
    throw "Agentia local quality gates failed. Exit code: $testExit"
}

Write-Host ""
Write-Host "Agentia local test: PASS"
Write-Host ""

# ------------------------------------------------------------
# 8. Publish feature branch and register commits with Copado
# ------------------------------------------------------------

Write-Host "============================================================"
Write-Host "[8/9] PUBLISHING COMMITS TO COPADO"
Write-Host "============================================================"
Write-Host ""
Write-Host "User Story : $Story"
Write-Host "Branch     : $ExpectedBranch"
Write-Host ""
Write-Host "This will:"
Write-Host "  - push the feature branch to GitHub"
Write-Host "  - register its commits with Copado"
Write-Host "  - update Copado change-list metadata"
Write-Host "  - merge the feature branch into the Dev1 branch"
Write-Host ""
Write-Host "It will NOT submit the story to the next environment."
Write-Host "It will NOT promote to INT/UAT/Production."
Write-Host ""

$confirmation = Read-Host "Type PUBLISH to continue"

if ($confirmation -ne "PUBLISH") {
    throw "Publish cancelled by user."
}

Write-Host ""
Write-Host "Publishing..."
Write-Host ""

agentia cicd work publish

$publishExit = $LASTEXITCODE

if ($publishExit -ne 0) {
    throw "Agentia work publish failed. Exit code: $publishExit"
}

Write-Host ""
Write-Host "Publish completed."
Write-Host ""

# ------------------------------------------------------------
# 9. Verify Copado + Git state
# ------------------------------------------------------------

Write-Host "============================================================"
Write-Host "[9/9] FINAL VERIFICATION"
Write-Host "============================================================"
Write-Host ""

Write-Host "Copado User Story status:"
agentia cicd work status $Story --json

Write-Host ""
Write-Host "Local branch:"
git branch --show-current

Write-Host ""
Write-Host "Git status:"
git status

Write-Host ""
Write-Host "Remote feature branch:"
git ls-remote --heads origin $ExpectedBranch

Write-Host ""
Write-Host "Recent commits:"
git log --oneline --decorate -10

Write-Host ""
Write-Host "Dev1 remote:"
git log origin/dev1-sfp -5 --oneline

Write-Host ""
Write-Host "============================================================"
Write-Host " PromotionProof commits have been published to Copado."
Write-Host ""
Write-Host " Open US-0000025 in Copado and refresh the page."
Write-Host " Check its Commits / Changes section."
Write-Host ""
Write-Host " DO NOT run work submit or promotion yet."
Write-Host "============================================================"