const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { RunCompletionStore, isSuccessfulRun } = require('../../src/util/RunCompletion.ts')

test('completion survives restart, expires next day, and is scoped to the selected accounts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-completion-'))
    try {
        const today = new Date(2026, 9, 10, 13)
        const first = new RunCompletionStore(dir, ['b@example.com', 'A@example.com'])
        assert.equal(first.completedToday(today), false)
        first.markCompleted(today)
        const restarted = new RunCompletionStore(dir, ['a@example.com', 'b@example.com'])
        assert.equal(restarted.completedToday(today), true)
        assert.equal(restarted.completedToday(new Date(2026, 9, 11)), false)
        assert.equal(new RunCompletionStore(dir, ['a@example.com']).completedToday(today), false)
        fs.writeFileSync(first.file, 'incomplete JSON')
        assert.equal(first.completedToday(today), false)
    } finally {
        assert.equal(path.dirname(dir), os.tmpdir())
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

test('failed, missing or empty account results must not mark a run complete', () => {
    assert.equal(isSuccessfulRun([{ success: true }, { success: true }], 2), true)
    assert.equal(isSuccessfulRun([{ success: true }, { success: false }], 2), false)
    assert.equal(isSuccessfulRun([{ success: true }], 2), false)
    assert.equal(isSuccessfulRun([], 0), false)
})
