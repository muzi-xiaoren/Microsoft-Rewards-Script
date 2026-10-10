import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export function localDayKey(now = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isSuccessfulRun(results: { success: boolean }[], expectedAccounts: number): boolean {
    return expectedAccounts > 0 && results.length === expectedAccounts && results.every(result => result.success)
}

export class RunCompletionStore {
    readonly file: string

    constructor(sessionPath: string, accountEmails: string[]) {
        const accounts = [...new Set(accountEmails.map(email => email.trim().toLowerCase()))].sort()
        const scope = createHash('sha256').update(JSON.stringify(accounts)).digest('hex')
        this.file = path.join(path.resolve(sessionPath), 'run-completion', `${scope}.json`)
    }

    completedToday(now = new Date()): boolean {
        try {
            const state = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { date?: string }
            return state.date === localDayKey(now)
        } catch {
            return false
        }
    }

    markCompleted(now = new Date()): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
        const temporaryFile = `${this.file}.${randomUUID()}.tmp`
        try {
            fs.writeFileSync(temporaryFile, JSON.stringify({ date: localDayKey(now) }) + '\n', { mode: 0o600 })
            fs.renameSync(temporaryFile, this.file)
        } finally {
            fs.rmSync(temporaryFile, { force: true })
        }
    }
}
