import type { MicrosoftRewardsBot } from '../index'
import type { HumanizeConfig, QuietHoursRule } from '../interface/Config'
import { RunCompletionStore } from './RunCompletion'

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

let bot: MicrosoftRewardsBot | null = null
let completionStore: RunCompletionStore | null = null

export function configureHumanize(botInstance: MicrosoftRewardsBot, accountEmails: string[]): void {
    bot = botInstance
    completionStore = new RunCompletionStore(bot.config.sessionPath, accountEmails)
}

function humanizeConfig(): HumanizeConfig | undefined {
    return bot?.config?.humanize
}

function enabled(): boolean {
    return Boolean(humanizeConfig()?.enabled)
}

// ---------- 当天去重（skipWhenCompletedToday） ----------

export function shouldSkipRunToday(): boolean {
    // Daily deduplication is independent of random delays and quiet hours.
    if (!humanizeConfig()?.skipWhenCompletedToday) return false
    return completionStore?.completedToday() ?? false
}

export function markRunSucceeded(): void {
    try {
        completionStore?.markCompleted()
    } catch (error) {
        bot?.logger.warn(
            'main',
            'RUN-STATE',
            `无法保存运行完成标志，下次启动将重试 | ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

// ---------- 静默时段（quietHours） ----------

function parseHHMM(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
}

function ruleAppliesToday(rule: QuietHoursRule, dayKey: string): boolean {
    return (rule.days ?? []).some(day => {
        const normalized = String(day).trim().toLowerCase()
        return normalized !== '' && dayKey.startsWith(normalized)
    })
}

function quietWaitMs(): number {
    const rules = enabled() ? humanizeConfig()?.quietHours : undefined
    if (!rules?.length) return 0

    const now = new Date()
    const dayKey = DAY_KEYS[now.getDay()] ?? ''
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60

    let best = Number.POSITIVE_INFINITY

    for (const rule of rules) {
        if (!ruleAppliesToday(rule, dayKey)) continue
        const start = parseHHMM(rule.start)
        const end = parseHHMM(rule.end)
        if (start === null || end === null || start === end) continue

        let wait = -1
        if (start < end) {
            if (nowMinutes >= start && nowMinutes < end) wait = end - nowMinutes
        } else if (nowMinutes >= start || nowMinutes < end) {
            wait = nowMinutes >= start ? 1440 - nowMinutes + end : end - nowMinutes
        }

        if (wait > 0) best = Math.min(best, wait)
    }

    return Number.isFinite(best) ? Math.max(Math.round(best * 60_000), 1000) : 0
}

function formatClock(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
}

export async function waitForQuietHours(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const waitMs = quietWaitMs()
        if (waitMs <= 0) return

        const resumeAt = new Date(Date.now() + waitMs)
        bot?.logger.info('main', 'HUMANIZE', `当前处于静默时段，挂起到 ${formatClock(resumeAt)}（humanize.quietHours）`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
    }
}

// ---------- 拟人化随机参数 ----------

export function getSearchTargetRatio(): number {
    const range = enabled() ? humanizeConfig()?.searchTargetRatio : undefined
    if (!range) return 1

    const min = Math.min(Math.max(Number(range.min) || 0, 0), 1)
    const max = Math.min(Math.max(Number(range.max) || 0, min), 1)
    return min + Math.random() * (max - min)
}

export function getReadToEarnArticleLimit(defaultLimit: number): number {
    const range = enabled() ? humanizeConfig()?.readToEarnArticles : undefined
    if (!range) return defaultLimit

    const min = Math.max(1, Math.floor(Number(range.min) || defaultLimit))
    const max = Math.max(min, Math.floor(Number(range.max) || defaultLimit))
    return min + Math.floor(Math.random() * (max - min + 1))
}
