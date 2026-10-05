import {Args, Command, Flags} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'

type Contract = {
  version: number
  story: {
    name: string
    title: string
  }
  component: string
  allowedPicklistAdds: string[]
  blockedUnexpectedChanges: boolean
}

type Finding = {
  ruleId: string
  severity: 'error' | 'warning'
  operation: 'add' | 'remove'
  component: string
  identity: string
  explanation: string
  remediation: string
}

export default class Check extends Command {
  static summary = 'Validate Salesforce semantic changes against an approved PromotionProof Change Contract'

  static description = `
PromotionProof compares the semantic Salesforce metadata changes in the current
Git branch against an approved User Story Change Contract.

Exit codes:
  0  PASS
  2  BLOCK - unauthorized semantic change detected
  3  ERROR - configuration or execution problem
`

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --story US-0000025',
    '<%= config.bin %> <%= command.id %> --base origin/main --json',
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
    json: Flags.boolean({
      description: 'Output machine-readable JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Check)

    const story = args.storyName ?? flags.story

    try {
      const repoRoot = this.getRepoRoot()

      const fieldPath =
        'force-app/main/default/objects/Case/fields/Sub_Category__c.field-meta.xml'

      const contractPath = resolve(repoRoot, flags.contract)
      const reportPath = resolve(repoRoot, flags.report)
      const workingFieldPath = resolve(repoRoot, fieldPath)

      if (!existsSync(contractPath)) {
        this.fail(
          `Change Contract not found: ${contractPath}`,
          flags.json,
        )
        return
      }

      if (!existsSync(workingFieldPath)) {
        this.fail(
          `Salesforce metadata not found: ${workingFieldPath}`,
          flags.json,
        )
        return
      }

      const contract = JSON.parse(
        readFileSync(contractPath, 'utf8').replace(/^\uFEFF/, ''),
      ) as Contract

      if (contract.story.name !== story) {
        this.fail(
          `Contract belongs to ${contract.story.name}, but ${story} was requested.`,
          flags.json,
        )
        return
      }

      const baseXml = this.gitShow(repoRoot, flags.base, fieldPath)
      const headXml = readFileSync(workingFieldPath, 'utf8')

      const baseValues = this.extractPicklistValues(baseXml)
      const headValues = this.extractPicklistValues(headXml)

      const addedValues = headValues.filter(
        value => !baseValues.includes(value),
      )

      const removedValues = baseValues.filter(
        value => !headValues.includes(value),
      )

      const allowedAdds = contract.allowedPicklistAdds ?? []

      const unexpectedAdds = addedValues.filter(
        value => !allowedAdds.includes(value),
      )

      const findings: Finding[] = []

      for (const value of unexpectedAdds) {
        findings.push({
          ruleId: 'PP-SCOPE-001',
          severity: 'error',
          operation: 'add',
          component: contract.component,
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
          component: contract.component,
          identity: value,
          explanation:
            'Existing picklist value was removed without approval.',
          remediation:
            'Restore the value or explicitly approve the destructive change.',
        })
      }

      const verdict = findings.length > 0 ? 'BLOCK' : 'PASS'

      const report = {
        schemaVersion: 1,
        engine: 'agentia-promotion-proof',
        engineVersion: this.config.pjson.version,
        story: contract.story,
        component: contract.component,
        baseRef: flags.base,
        headRef: 'HEAD',
        baseValues,
        headValues,
        allowedAdds,
        addedValues,
        removedValues,
        unexpectedAdds,
        findings,
        verdict,
      }

      mkdirSync(dirname(reportPath), {recursive: true})

      writeFileSync(
        reportPath,
        JSON.stringify(report, null, 2) + '\n',
        'utf8',
      )

      if (flags.json) {
        this.log(JSON.stringify(report, null, 2))
      } else {
        this.renderHuman(report)
      }

      if (verdict === 'BLOCK') {
        this.exit(2)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      this.fail(message, flags.json)
    }
  }

  private getRepoRoot(): string {
    try {
      return execFileSync(
        'git',
        ['rev-parse', '--show-toplevel'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim()
    } catch {
      throw new Error(
        'PromotionProof must be executed inside a Git repository.',
      )
    }
  }

  private gitShow(
    cwd: string,
    baseRef: string,
    fieldPath: string,
  ): string {
    try {
      return execFileSync(
        'git',
        ['show', `${baseRef}:${fieldPath}`],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch {
      throw new Error(
        `Unable to read ${fieldPath} from Git base ${baseRef}.`,
      )
    }
  }

  private extractPicklistValues(xml: string): string[] {
    const values: string[] = []

    const regex =
      /<value>\s*<fullName>(.*?)<\/fullName>/gs

    for (const match of xml.matchAll(regex)) {
      const value = match[1]?.trim()

      if (value) {
        values.push(value)
      }
    }

    return values
  }

  private renderHuman(report: {
    story: {name: string; title: string}
    component: string
    allowedAdds: string[]
    addedValues: string[]
    removedValues: string[]
    findings: Finding[]
    verdict: string
  }): void {
    this.log('')
    this.log('============================================================')
    this.log(' PromotionProof - Agentia Plugin')
    this.log('============================================================')
    this.log('')

    this.log(`Story     : ${report.story.name}`)
    this.log(`Component : ${report.component}`)

    this.log('')
    this.log('Approved semantic additions:')

    if (report.allowedAdds.length === 0) {
      this.log('  (none)')
    } else {
      for (const value of report.allowedAdds) {
        this.log(`  + ${value}`)
      }
    }

    this.log('')
    this.log('Actual semantic additions:')

    if (report.addedValues.length === 0) {
      this.log('  (none)')
    } else {
      for (const value of report.addedValues) {
        this.log(`  + ${value}`)
      }
    }

    if (report.removedValues.length > 0) {
      this.log('')
      this.log('Removed semantic values:')

      for (const value of report.removedValues) {
        this.log(`  - ${value}`)
      }
    }

    if (report.findings.length > 0) {
      this.log('')
      this.log('Findings:')

      for (const finding of report.findings) {
        this.log('')
        this.log(`${finding.ruleId} - ${finding.explanation}`)
        this.log(`Component : ${finding.component}`)
        this.log(`Operation : ${finding.operation}`)
        this.log(`Value     : ${finding.identity}`)
        this.log(`Fix       : ${finding.remediation}`)
      }
    }

    this.log('')
    this.log(`PROMOTIONPROOF VERDICT: ${report.verdict}`)
    this.log('')
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
