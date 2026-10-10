import PQueue from 'p-queue'
import type { WebhookServerChanConfig } from '../interface/Config'
import { flushQueue } from './Queue'

const serverChanQueue = new PQueue({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
})

export async function sendServerChan(config: WebhookServerChanConfig, content: string): Promise<void> {
    if (!config?.sendKey) return

    // 使用 Node 内置 fetch 而非 impit，避免长时间运行后共享实例状态问题
    const url = `https://sctapi.ftqq.com/${config.sendKey}.send`
    const body = JSON.stringify({
        title: config.title ?? 'Microsoft-Rewards-Script',
        desp: content
    })

    await serverChanQueue.add(async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal
            })
            if (!res.ok) console.error(`[ServerChan] 推送失败 | status=${res.status}`)
        } catch (err) {
            console.error(`[ServerChan] 推送异常 | ${(err as Error)?.message}`)
        } finally {
            clearTimeout(timer)
        }
    })
}

export function flushServerChanQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(serverChanQueue, timeoutMs)
}
