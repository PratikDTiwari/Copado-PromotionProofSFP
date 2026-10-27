---
name: promotion-proof
description: Semantic authorization release guardrail for Salesforce delivery with Copado Agentia. Validates picklist scopes, PermissionSet escalations, and SHA cryptographic digest integrity against human-approved Change Contracts.
---

# PromotionProof — Copado Agentia Release Guardrail

**PromotionProof** proves that a release contain **only human-approved changes** before Copado Agentia permits promotion or deployment.

## When to Use

Use this skill whenever:
1. Validating a Salesforce metadata change against a Copado User Story.
2. Checking for unauthorized picklist additions (`PP-SCOPE-001`) or accidental removals (`PP-DESTRUCTIVE-001`).
3. Verifying PermissionSet security access controls (`PP-PERM-001`).
4. Checking cryptographic SHA digest integrity to ensure contract approval has not been bypassed (`PP-CONTRACT-STALE-001`).

## How to Execute

### 1. Run Semantic Check via Agentia CLI

```bash
agentia promotion-proof check --story US-0000025
```

### 2. Output Machine-Readable JSON Evidence

```bash
agentia promotion-proof check --story US-0000025 --json
```

### 3. Generate Attestation Reports (Markdown & SARIF)

```bash
agentia promotion-proof check --story US-0000025 --markdown .promotion-proof/reports/summary.md --sarif .promotion-proof/reports/results.sarif
```

## Policy Exit Codes

- **`0` (PASS)**: Release artifact contains ONLY approved semantic changes. Safe to proceed with Copado deployment.
- **`2` (BLOCK)**: Unauthorized semantic changes, permission escalations, or stale contract digests detected. Block deployment and alert release manager.
- **`3` (ERROR)**: Missing contract or repository configuration error.

## Change Contract Location

Contracts are stored at:
```text
.promotion-proof/contracts/<STORY_NAME>.json
```

Example Contract structure:
```json
{
  "version": 1,
  "story": {
    "name": "US-0000025",
    "title": "PromotionProof Demo - Add API Failure Opt Out Exception"
  },
  "component": "Case.Sub_Category__c",
  "allowedPicklistAdds": [
    "API Failure Opt Out Exception"
  ],
  "allowedPermissions": [
    "FieldPermissions: Case.Sub_Category__c (readable:true, editable:true)"
  ],
  "blockedUnexpectedChanges": true
}
```
