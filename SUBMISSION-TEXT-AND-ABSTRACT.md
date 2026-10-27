# PromotionProof — Official Copado Hackathon Submission Copy

> **Copy & paste these exact fields into your Copado Hackathon submission form or Devpost entry.**

---

## 📌 1. Basic Submission Metadata

- **Project Name**: PromotionProof
- **Tagline**: An intent-aware, authorization-bound semantic release guardrail for Salesforce delivery with Copado Agentia.
- **Track**: Copado Agentia Headless Virtual Hackathon 2026
- **Primary Developer / Contact**: Pratik Tiwari
- **GitHub Repository**: `https://github.com/PratikDTiwari/Copado-PromotionProofSFP.git`
- **Target User Story**: `US-0000025` (*PromotionProof Demo - Add API Failure Opt Out Exception*)
- **Primary CLI Command**: `agentia promotion-proof check --story US-0000025`

---

## 📝 2. Project Abstract (For Hackathon Form)

### Executive Abstract (150 words):
Salesforce metadata components (like `CustomField` picklists and `PermissionSet` XMLs) are multi-tenant XML containers. During branch synchronization, AI code generation, or cherry-picking, unapproved picklist values or security permissions frequently leak into valid XML files. Standard Salesforce deployment validation only verifies compile-time syntax ("Can this deploy?"), allowing unauthorized business logic to leak into production.

**PromotionProof** solves this by establishing an **authorization-aware release guardrail** powered by Copado Agentia. It introduces **Semantic Change Contracts** backed by **Cryptographic SHA-256 Digest Binding**. PromotionProof parses Git deltas across modified metadata files, validates picklist additions (`PP-SCOPE-001`), blocks unapproved removals (`PP-DESTRUCTIVE-001`), flags security permission escalations (`PP-PERM-001`), and prevents contract tampering (`PP-CONTRACT-STALE-001`). Operating natively inside `agentia cicd work test --local`, PromotionProof exports JSON evidence, Markdown attestations, and SARIF compliance reports directly to Copado.

---

## 💥 3. The Core Problem Statement

Salesforce DevOps deployment validation answers:
> *"Is this metadata valid XML that can compile and deploy?"*

It does NOT answer:
> *"Does this deployment contain ONLY the exact changes authorized by the business for this User Story?"*

### Real-World Example:
A product owner approves adding **1 picklist value** (`API Failure Opt Out Exception`) to `Case.Sub_Category__c`. During a git merge or AI auto-generation, an unapproved picklist value (`Account Information Category`) or a `PermissionSet` field permission is added to the same XML file.

Salesforce deployment validation passes with a green checkmark because all XML tags are syntactically valid. **Result**: Unauthorized business logic and security access leak into Production undetected.

---

## 💡 4. The PromotionProof Solution Architecture

```text
       ┌───────────────────────────────┐
       │  Human / Product Owner       │
       │  Approves Change Contract     │
       └──────────────┬────────────────┘
                      │ Cryptographic Digest Binding (SHA-256)
                      ▼
┌───────────────────────────────────────────────┐
│           PromotionProof Engine               │
├───────────────────────────────────────────────┤
│ 1. Artifact Integrity (SHA-256 Contract Check)│
│ 2. Dynamic Git Diff Metadata Scanner          │
│ 3. CustomField Picklist Delta Parser          │
│ 4. PermissionSet Security Escalation Guard    │
└──────────────┬────────────────┬───────────────┘
               │                │
      PASS     ▼                ▼    BLOCK (Exit Code 2)
  Deploy Approved          Unauthorized Picklist / 
  Release Artifact         Permission Escalation / 
                           Tampered Contract
```

PromotionProof operates as an Agentia CLI TypeScript plugin (`agentia-promotion-proof`), a local quality gate script (`.agentia_quality_gates.cmd`), and a native Agentia AI Skill (`.agents/skills/promotion-proof/SKILL.md`).

---

## 🛡️ 5. Enforcement Rules & Exit Codes

| Rule ID | Rule Category | Description | Severity | Exit Code |
| :--- | :--- | :--- | :--- | :---: |
| **`PP-SCOPE-001`** | **Scope Violation** | Picklist value added without inclusion in the Change Contract. | ERROR | **2 (BLOCK)** |
| **`PP-DESTRUCTIVE-001`** | **Destructive Change** | Existing production picklist value removed without approval. | ERROR | **2 (BLOCK)** |
| **`PP-PERM-001`** | **Security Escalation** | Unauthorized field or object permission grant in PermissionSet. | ERROR | **2 (BLOCK)** |
| **`PP-CONTRACT-STALE-001`** | **Integrity Mismatch** | Git HEAD SHA or contract digest modified after approval. | ERROR | **2 (BLOCK)** |

---

## 🧰 6. Technologies & Libraries Used

- **Framework**: Copado Agentia CLI (`@copado/agentia-cli/1.0.0-beta.2`), oclif CLI Framework
- **Language**: TypeScript / Node.js (`v24.18.0`)
- **Version Control**: Git (`2.51.0`), GitHub CLI (`2.92.0`)
- **Platform**: Salesforce CLI (`2.130.9`), Source Format Pipelines (SFP)
- **Attestation Standards**: SARIF (Static Analysis Results Interchange Format v2.1.0), GitHub-Flavored Markdown, JSON Schema v1

---

## 🚀 7. Key Features & Accomplishments

1. **Cryptographic Intent-Binding**: Calculates SHA-256 digests for approved contracts and commit SHAs to prevent contract tampering or reusing stale approvals.
2. **Multi-Metadata Security Guard**: Scans `CustomField` picklist values and `PermissionSet` XML security access tags (`<fieldPermissions>`, `<objectPermissions>`).
3. **Multi-Format Attestation Suite**:
   - `latest-plugin.json` (Machine-readable evidence)
   - `summary.md` (Human-readable release attestation)
   - `results.sarif` (Industry standard for CI/CD security scanning)
4. **Agentia Quality Gate Integration**: Native execution during `agentia cicd work test --local`.
5. **Agentia AI Agent Skill**: Native Skill package at `.agents/skills/promotion-proof/SKILL.md`.

---

## 🎬 8. Automated Demonstration Commands

All 4 scenarios can be executed instantly via PowerShell:

```powershell
# Scenario 1: Approved Release (PASS)
powershell -ExecutionPolicy Bypass -File .\scripts\demo-pass.ps1

# Scenario 2: Unapproved Picklist Contamination (BLOCK)
powershell -ExecutionPolicy Bypass -File .\scripts\demo-block-contamination.ps1

# Scenario 3: PermissionSet Security Escalation (BLOCK)
powershell -ExecutionPolicy Bypass -File .\scripts\demo-block-permissions.ps1

# Scenario 4: Stale Contract / Digest Tamper (BLOCK)
powershell -ExecutionPolicy Bypass -File .\scripts\demo-block-tamper.ps1
```
