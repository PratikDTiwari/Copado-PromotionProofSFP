# PromotionProof — End-to-End Copado Enterprise Feature & Record Mapping Guide

> **A complete reference mapping every PromotionProof feature to Copado Salesforce Objects, Reports, Quality Gate Rules, and Attestation Artifacts.**

---

## 🏗️ 1. End-to-End Copado Architecture Mapping

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           Copado User Story (US-0000025)                    │
 └──────┬─────────────────────────────┬─────────────────────────────┬──────────┘
        │                             │                             │
        ▼                             ▼                             ▼
┌──────────────┐             ┌─────────────────┐           ┌─────────────────┐
│ Chatter Feed │             │ Related Files   │           │ Copado Results  │
│  (FeedItem)  │             │ (ContentVersion)│           │(copado__Result) │
├──────────────┤             ├─────────────────┤           ├─────────────────┤
│ Cryptographic│             │ 1. summary.md   │           │ Status: Success │
│ SHA Signature│             │ 2. sarif.json   │           │ Job: Promotion  │
│ Attestation  │             │ 3. report.html  │           │ Status: Failed  │
└──────────────┘             └─────────────────┘           └────────┬────────┘
                                                                    │
                                                                    ▼
                                                       ┌────────────────────────┐
                                                       │ Salesforce Compliance  │
                                                       │  Reports & Dashboards  │
                                                       ├────────────────────────┤
                                                       │ PromotionProof         │
                                                       │ Compliance Report      │
                                                       └────────────────────────┘
```

---

## 📌 2. Feature & Copado Salesforce Object Matrix

| Feature Name | Primary Purpose | Copado Salesforce Object | Field / Record Value |
| :--- | :--- | :--- | :--- |
| **Semantic Change Contract** | Defines human-approved metadata scope. | Local Repository Contract | `.promotion-proof/contracts/US-0000025.json` |
| **SHA-256 Digest Binding** | Cryptographically prevents contract tampering (`PP-CONTRACT-STALE-001`). | User Story Chatter & Copado Result | `c875ec897c3989476c41d0311dee59becb5d1f0218b9f13e6dca6ad373575164` |
| **PermissionSet Security Guard** | Detects unapproved field/object access (`PP-PERM-001`). | Copado Result Record | `copado__Result__c.copado__Progress_Status__c = 'PROMOTIONPROOF_VERDICT_BLOCK_PERM_001'` |
| **Picklist Scope Guard** | Detects unapproved picklist additions (`PP-SCOPE-001`). | Copado Result Record | `copado__Result__c.copado__Progress_Status__c = 'PROMOTIONPROOF_VERDICT_BLOCK_SCOPE_001'` |
| **Copado Quality Gate Rule** | Enforces execution before promotion/deployment. | `copado__Quality_Gate_Rule__c` | `Name = 'PromotionProof_Semantic_Guardrail'`, `copado__Execution_Sequence__c = 'before'` |
| **Salesforce Compliance Report** | Native reporting dashboard for PASS vs BLOCK runs. | `Report` Metadata | `unfiled$public/PromotionProof_Compliance_Report` |
| **SARIF Attestation** | Static Analysis standard for CI/CD compliance. | `ContentVersion` Attachment | Attached to `US-0000025` Files |
| **HTML Visual Matrix** | Interactive visual report for browser inspection. | `ContentVersion` Attachment | `consolidated-execution-report.html` attached to `US-0000025` |

---

## 📊 3. Native Salesforce Reports & Dashboards Setup

The pre-configured report **PromotionProof Compliance Report** is deployed directly to your org under **All Reports**.

### Report Structure:
- **Object**: `copado__Result__c`
- **Filter**: `copado__Job_Type__c startsWith 'PromotionProof'`
- **Columns**: `User Story` (`copado__User_Story__c`), `Result Name`, `Job Type`, `Progress Status`, `Created Date`
- **Grouped By**: `Status` (`Success` vs `Failed`)
- **Chart**: Donut Chart showing **PASS (Authorized)** vs **BLOCK (Prevented Creep)**

---

## 🛠️ 4. Automated Execution & Management Scripts

All scripts are located in `F:\Copado Hackton\promotion-proof-clean\scripts\`:

1. **`demo-pass.ps1`**: Executes approved release ➔ **PASS (Exit 0)**.
2. **`demo-block-contamination.ps1`**: Simulates picklist contamination ➔ **BLOCK (Exit 2)**.
3. **`demo-block-permissions.ps1`**: Simulates PermissionSet security escalation ➔ **BLOCK (Exit 2)**.
4. **`demo-block-tamper.ps1`**: Simulates contract digest tampering ➔ **BLOCK (Exit 2)**.
5. **`generate-promotionproof-consolidated-report.ps1`**: Generates JSON, Markdown, & HTML reports.
6. **`setup-copado-enterprise-features.ps1`**: Configures Quality Gate Rules, Chatter Signatures, & Result Records.
7. **`attach-report-to-copado.ps1`**: Uploads HTML/SARIF/Markdown files onto User Story `US-0000025`.

---

## 🏆 5. Summary for Hackathon Demo

> *"PromotionProof provides an end-to-end governance lifecycle inside Copado. From local developer execution via Agentia CLI, to SHA-256 cryptographic intent-binding, to native Salesforce Reports & Chatter attestations, PromotionProof ensures that only human-authorized changes ever reach production."*
