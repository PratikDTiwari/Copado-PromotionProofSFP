import {Args, Command, Flags} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'

type Contract = {
  version: number
  story: {
    name: string
    title: string
  }
  component?: string
  headSha?: string
  contractDigest?: string
  allowedPicklistAdds?: string[]
  allowedPermissions?: string[]
  blockedUnexpectedChanges?: boolean
}

type Finding = {
  ruleId: string
  severity: 'error' | 'warning'
  operation: 'add' | 'remove' | 'modify' | 'tamper'
  component: string
  identity: string
  explanation: string
  remediation: string
}

type Report = {
  schemaVersion: number
  engine: string
  engineVersion: string
  story: {name: string; title: string}
  component: string
  baseRef: string
  headRef: string
  headSha: string
  contractDigest?: string
  actualDigest?: string
  baseValues: string[]
  headValues: string[]
  allowedAdds: string[]
  addedValues: string[]
  removedValues: string[]
  unexpectedAdds: string[]
  permissionFindings: string[]
  findings: Finding[]
  verdict: 'PASS' | 'BLOCK' | 'ERROR'
}

export default class Check extends Command {
  static summary =
    'Validate Salesforce semantic changes against an approved PromotionProof Change Contract'

  static description = `
PromotionProof compares the semantic Salesforce metadata changes in the current
Git branch against an approved User Story Change Contract.

Features:
  - Picklist addition & removal scope validation (PP-SCOPE-001, PP-DESTRUCTIVE-001)
  - PermissionSet security escalation detection (PP-PERM-001)
  - Cryptographic Digest & SHA contract binding (PP-CONTRACT-STALE-001)
  - Multi-format attestation: JSON, Markdown summary, and SARIF output

Exit codes:
  0  PASS
  2  BLOCK - unauthorized semantic change detected
  3  ERROR - configuration or execution problem
`

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --story US-0000025',
    '<%= config.bin %> <%= command.id %> --base origin/main --json',
    '<%= config.bin %> <%= command.id %> --markdown .promotion-proof/reports/summary.md',
  ]

  static args = {
    storyName: Args.string({
      description: 'Optional User Story name, for example US-0000025',
      required: false,
    }),
  }

  static flags = {
    story: Flags.string({
      description: 'Copado User Story name',
      default: 'US-0000025',
    }),
    base: Flags.string({
      description: 'Git base reference used for semantic comparison',
      default: 'origin/main',
    }),
    contract: Flags.string({
      description: 'Path to PromotionProof Change Contract',
      default: '.promotion-proof/contracts/US-0000025.json',
    }),
    report: Flags.string({
      description: 'Path for generated JSON evidence',
      default: '.promotion-proof/reports/latest-plugin.json',
    }),
    markdown: Flags.string({
      description: 'Path for generated Markdown attestation report',
      default: '.promotion-proof/reports/summary.md',
    }),
    sarif: Flags.string({
      description: 'Path for generated SARIF report',
      default: '.promotion-proof/reports/results.sarif',
    }),
    json: Flags.boolean({
      description: 'Output machine-readable JSON',
      default: false,
    }),
    fix: Flags.boolean({
      description: 'Automatically revert unauthorized metadata additions to restore clean baseline',
      default: false,
    }),
    drift: Flags.boolean({
      description: 'Check for target Salesforce Org metadata drift and desync before deployment',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Check)
    const story = args.storyName ?? flags.story

    try {
      const repoRoot = this.getRepoRoot()
      const contractPath = resolve(repoRoot, flags.contract)
      const reportPath = resolve(repoRoot, flags.report)
      const markdownPath = resolve(repoRoot, flags.markdown)
      const sarifPath = resolve(repoRoot, flags.sarif)

      if (!existsSync(contractPath)) {
        this.fail(`Change Contract not found: ${contractPath}`, flags.json)
        return
      }

      const contractRaw = readFileSync(contractPath, 'utf8').replace(/^\uFEFF/, '')
      const contract = JSON.parse(contractRaw) as Contract

      if (contract.story.name !== story) {
        this.fail(
          `Contract belongs to ${contract.story.name}, but ${story} was requested.`,
          flags.json,
        )
        return
      }

      const currentHeadSha = this.getHeadSha(repoRoot)
      const findings: Finding[] = []

      // ------------------------------------------------------------
      // 1. SHA Digest & Cryptographic Integrity Check (PP-CONTRACT-STALE-001)
      // ------------------------------------------------------------
      if (contract.headSha && contract.headSha !== '*' && contract.headSha !== currentHeadSha) {
        findings.push({
          ruleId: 'PP-CONTRACT-STALE-001',
          severity: 'error',
          operation: 'tamper',
          component: contract.component ?? 'Git.Repository',
          identity: `Expected SHA: ${contract.headSha}, Actual SHA: ${currentHeadSha}`,
          explanation:
            'Git HEAD commit SHA does not match the SHA recorded during contract approval.',
          remediation:
            'Re-evaluate semantic changes and update the contract with the current commit SHA.',
        })
      }

      // Compute actual contract digest
      const actualDigest = createHash('sha256')
        .update(contractRaw.trim())
        .digest('hex')

      if (contract.contractDigest && contract.contractDigest !== actualDigest) {
        findings.push({
          ruleId: 'PP-CONTRACT-STALE-001',
          severity: 'error',
          operation: 'tamper',
          component: contract.component ?? 'Contract.Digest',
          identity: `Expected Digest: ${contract.contractDigest}, Actual Digest: ${actualDigest}`,
          explanation:
            'Change contract body has been modified after human approval signature.',
          remediation:
            'Restore original approved contract file or obtain re-approval.',
        })
      }

      // ------------------------------------------------------------
      // 2. Metadata File Discovery & Semantic Analysis
      // ------------------------------------------------------------
      const fieldPath =
        'force-app/main/default/objects/Case/fields/Sub_Category__c.field-meta.xml'
      const workingFieldPath = resolve(repoRoot, fieldPath)

      let baseValues: string[] = []
      let headValues: string[] = []
      let addedValues: string[] = []
      let removedValues: string[] = []
      let unexpectedAdds: string[] = []

      if (existsSync(workingFieldPath)) {
        const baseXml = this.gitShow(repoRoot, flags.base, fieldPath)
        const headXml = readFileSync(workingFieldPath, 'utf8')

        baseValues = this.extractPicklistValues(baseXml)
        headValues = this.extractPicklistValues(headXml)

        addedValues = headValues.filter(value => !baseValues.includes(value))
        removedValues = baseValues.filter(value => !headValues.includes(value))

        const allowedAdds = contract.allowedPicklistAdds ?? []
        unexpectedAdds = addedValues.filter(value => !allowedAdds.includes(value))

        for (const value of unexpectedAdds) {
          findings.push({
            ruleId: 'PP-SCOPE-001',
            severity: 'error',
            operation: 'add',
            component: contract.component ?? 'Case.Sub_Category__c',
            identity: value,
            explanation:
              'Picklist value is not included in the approved Change Contract.',
            remediation:
              'Remove the value or obtain explicit approval in a separate User Story.',
          })
        }

        for (const value of removedValues) {
          findings.push({
            ruleId: 'PP-DESTRUCTIVE-001',
            severity: 'error',
            operation: 'remove',
            component: contract.component ?? 'Case.Sub_Category__c',
            identity: value,
            explanation:
              'Existing picklist value was removed without approval.',
            remediation:
              'Restore the value or explicitly approve the destructive change.',
          })
        }
      }

      // ------------------------------------------------------------
      // 3. PermissionSet Security Escalation Guard (PP-PERM-001)
      // ------------------------------------------------------------
      const permFindingsText: string[] = []
      const permSetPath =
        'force-app/main/default/permissionsets/Admin_Security_Tier.permissionset-meta.xml'
      const workingPermPath = resolve(repoRoot, permSetPath)

      if (existsSync(workingPermPath)) {
        const basePermXml = this.gitShow(repoRoot, flags.base, permSetPath)
        const headPermXml = readFileSync(workingPermPath, 'utf8')

        const basePerms = this.extractPermissions(basePermXml)
        const headPerms = this.extractPermissions(headPermXml)

        const addedPerms = headPerms.filter(p => !basePerms.includes(p))
        const allowedPerms = contract.allowedPermissions ?? []
        const unexpectedPerms = addedPerms.filter(p => !allowedPerms.includes(p))

        for (const perm of unexpectedPerms) {
          permFindingsText.push(perm)
          findings.push({
            ruleId: 'PP-PERM-001',
            severity: 'error',
            operation: 'add',
            component: 'Admin_Security_Tier.permissionset-meta.xml',
            identity: perm,
            explanation:
              'Unauthorized security permission escalation detected in PermissionSet.',
            remediation:
              'Revert permission addition or specify allowed permission in contract.',
          })
        }
      }

      // ------------------------------------------------------------
      // 4. Target Salesforce Org Drift & Desync Detection (PP-DRIFT-001)
      // ------------------------------------------------------------
      const driftFile = resolve(repoRoot, '.promotion-proof/org-drift.json')
      if (flags.drift || existsSync(driftFile)) {
        if (existsSync(driftFile)) {
          const driftData = JSON.parse(readFileSync(driftFile, 'utf8').replace(/^\uFEFF/, ''))
          if (driftData.hasDrift && driftData.unSyncedComponents) {
            for (const comp of driftData.unSyncedComponents) {
              findings.push({
                ruleId: 'PP-DRIFT-001',
                severity: 'error',
                operation: 'modify',
                component: comp.componentName,
                identity: comp.desyncDetail,
                explanation:
                  'Target Salesforce Org contains uncommitted changes not present in Git. Deployment will overwrite target Org metadata.',
                remediation:
                  'Retrieve target Org changes into Git repository before deployment.',
              })
            }
          }
        }
      }

      const verdict: 'PASS' | 'BLOCK' = findings.length > 0 ? 'BLOCK' : 'PASS'

      const report: Report = {
        schemaVersion: 1,
        engine: 'agentia-promotion-proof',
        engineVersion: this.config.pjson.version,
        story: contract.story,
        component: contract.component ?? 'Case.Sub_Category__c',
        baseRef: flags.base,
        headRef: 'HEAD',
        headSha: currentHeadSha,
        contractDigest: contract.contractDigest,
        actualDigest,
        baseValues,
        headValues,
        allowedAdds: contract.allowedPicklistAdds ?? [],
        addedValues,
        removedValues,
        unexpectedAdds,
        permissionFindings: permFindingsText,
        findings,
        verdict,
      }

      // Write JSON report
      mkdirSync(dirname(reportPath), {recursive: true})
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')

      // Write Markdown Attestation
      mkdirSync(dirname(markdownPath), {recursive: true})
      writeFileSync(markdownPath, this.generateMarkdown(report), 'utf8')

      // Write SARIF report
      mkdirSync(dirname(sarifPath), {recursive: true})
      writeFileSync(sarifPath, this.generateSarif(report), 'utf8')

      if (flags.json) {
        this.log(JSON.stringify(report, null, 2))
      } else {
        this.renderHuman(report)
      }

      if (verdict === 'BLOCK') {
        if (flags.fix) {
          this.log('\n[+] --fix flag passed: Reverting unauthorized metadata additions via git checkout...')
          try {
            execFileSync('git', ['checkout', '--', 'force-app/'], {cwd: repoRoot})
            this.log('[+] Repository restored to clean approved baseline state.')
          } catch {
            this.log('[-] Could not automatically revert changes.')
          }
        }
        process.exitCode = 2
        return
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'oclif' in error) {
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      this.fail(message, flags.json)
    }
  }

  private getRepoRoot(): string {
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    } catch {
      throw new Error(
        'PromotionProof must be executed inside a Git repository.',
      )
    }
  }

  private getHeadSha(cwd: string): string {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    } catch {
      return 'UNKNOWN'
    }
  }

  private gitShow(cwd: string, baseRef: string, filePath: string): string {
    try {
      return execFileSync('git', ['show', `${baseRef}:${filePath}`], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      return ''
    }
  }

  private extractPicklistValues(xml: string): string[] {
    const values: string[] = []
    const regex = /<value>\s*<fullName>(.*?)<\/fullName>/gs
    for (const match of xml.matchAll(regex)) {
      const value = match[1]?.trim()
      if (value) {
        values.push(value)
      }
    }
    return values
  }

  private extractPermissions(xml: string): string[] {
    const perms: string[] = []
    const fieldRegex = /<fieldPermissions>\s*<editable>(.*?)<\/editable>\s*<field>(.*?)<\/field>\s*<readable>(.*?)<\/readable>\s*<\/fieldPermissions>/gs
    for (const match of xml.matchAll(fieldRegex)) {
      const editable = match[1]?.trim()
      const field = match[2]?.trim()
      const readable = match[3]?.trim()
      perms.push(`FieldPermissions: ${field} (readable:${readable}, editable:${editable})`)
    }
    return perms
  }

  private renderHuman(report: Report): void {
    this.log('')
    this.log('============================================================')
    this.log(' PromotionProof - Copado Agentia Release Guard')
    this.log('============================================================')
    this.log('')
    this.log(`Story           : ${report.story.name} (${report.story.title})`)
    this.log(`Component       : ${report.component}`)
    this.log(`Head SHA        : ${report.headSha.substring(0, 8)}`)
    if (report.actualDigest) {
      this.log(`Contract Digest : ${report.actualDigest.substring(0, 16)}...`)
    }

    this.log('')
    this.log('Approved Picklist Additions:')
    if (report.allowedAdds.length === 0) {
      this.log('  (none)')
    } else {
      for (const val of report.allowedAdds) {
        this.log(`  + ${val}`)
      }
    }

    this.log('')
    this.log('Actual Picklist Additions:')
    if (report.addedValues.length === 0) {
      this.log('  (none)')
    } else {
      for (const val of report.addedValues) {
        this.log(`  + ${val}`)
      }
    }

    if (report.removedValues.length > 0) {
      this.log('')
      this.log('Removed Picklist Values:')
      for (const val of report.removedValues) {
        this.log(`  - ${val}`)
      }
    }

    if (report.findings.length > 0) {
      this.log('')
      this.log('------------------------------------------------------------')
      this.log(' FINDINGS & VIOLATIONS DETECTED')
      this.log('------------------------------------------------------------')
      for (const finding of report.findings) {
        this.log('')
        this.log(`[${finding.ruleId}] ${finding.explanation}`)
        this.log(`  Component : ${finding.component}`)
        this.log(`  Operation : ${finding.operation}`)
        this.log(`  Identity  : ${finding.identity}`)
        this.log(`  Remediation: ${finding.remediation}`)
      }
    }

    this.log('')
    this.log('============================================================')
    this.log(`PROMOTIONPROOF VERDICT: ${report.verdict}`)
    this.log('============================================================')
    this.log('')
  }

  private generateMarkdown(report: Report): string {
    return `# PromotionProof Attestation Report

- **User Story**: ${report.story.name} (${report.story.title})
- **Engine**: ${report.engine} v${report.engineVersion}
- **Head SHA**: \`${report.headSha}\`
- **Verdict**: **${report.verdict}**

## Summary
- Approved Picklist Additions: \`${report.allowedAdds.join(', ') || 'None'}\`
- Actual Picklist Additions: \`${report.addedValues.join(', ') || 'None'}\`
- Total Findings: ${report.findings.length}

## Detailed Findings
${
  report.findings.length === 0
    ? '*No policy violations detected. Release is authorized.*'
    : report.findings
        .map(
          f =>
            `- **[${f.ruleId}]** \`${f.identity}\`: ${f.explanation} *(Fix: ${f.remediation})*`,
        )
        .join('\n')
}

---
*Report generated automatically by PromotionProof for Copado Agentia.*
`
  }

  private generateSarif(report: Report): string {
    return JSON.stringify(
      {
        $schema:
          'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            tool: {
              driver: {
                name: 'PromotionProof',
                version: report.engineVersion,
                rules: [
                  {
                    id: 'PP-SCOPE-001',
                    shortDescription: {text: 'Unauthorized metadata addition'},
                  },
                  {
                    id: 'PP-DESTRUCTIVE-001',
                    shortDescription: {text: 'Unapproved metadata removal'},
                  },
                  {
                    id: 'PP-PERM-001',
                    shortDescription: {text: 'PermissionSet security escalation'},
                  },
                  {
                    id: 'PP-CONTRACT-STALE-001',
                    shortDescription: {text: 'Contract SHA or digest mismatch'},
                  },
                  {
                    id: 'PP-DRIFT-001',
                    shortDescription: {text: 'Target Salesforce Org metadata desync or drift'},
                  },
                ],
              },
            },
            results: report.findings.map(f => ({
              ruleId: f.ruleId,
              level: f.severity === 'error' ? 'error' : 'warning',
              message: {text: `${f.explanation} Identity: ${f.identity}`},
            })),
          },
        ],
      },
      null,
      2,
    )
  }

  private fail(message: string, json: boolean): never {
    if (json) {
      this.log(
        JSON.stringify(
          {
            verdict: 'ERROR',
            error: message,
          },
          null,
          2,
        ),
      )
    } else {
      this.log('')
      this.log('PROMOTIONPROOF VERDICT: ERROR')
      this.log(message)
      this.log('')
    }
    return this.exit(3)
  }
}
