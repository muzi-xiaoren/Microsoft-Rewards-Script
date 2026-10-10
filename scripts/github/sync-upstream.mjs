import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { api, command, publishForkRelease } from './release-fork.mjs'

const upstream = 'chiihero/Microsoft-Rewards-Script'
const repository = process.env.SYNC_REPOSITORY
const branch = 'V4-china'
if (repository !== 'muzi-xiaoren/Microsoft-Rewards-Script') throw new Error('Expected fork repository')
const git = (...args) => command('git', args)
function summary(message) {
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

git('config', 'user.name', 'github-actions[bot]')
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
git('remote', 'add', 'upstream', `https://github.com/${upstream}.git`)
git('fetch', '--no-tags', 'upstream', branch)
const forkCommit = git('rev-parse', 'HEAD')
const merge = spawnSync('git', ['merge', '--no-edit', '--no-commit', '--no-ff', `upstream/${branch}`], {
    encoding: 'utf8'
})
const hasMerge = spawnSync('git', ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']).status === 0
if (hasMerge) git('restore', `--source=${forkCommit}`, '--staged', '--worktree', '--', '.github/workflows')
const conflicts = git('diff', '--name-only', '--diff-filter=U')
if (conflicts || (merge.status !== 0 && !hasMerge)) {
    if (hasMerge) git('merge', '--abort')
    summary(
        `Resolve upstream sync manually: https://github.com/${repository}/compare/${branch}...${upstream.split('/')[0]}:${branch}. Conflicts: ${conflicts || merge.stderr}. No release published.`
    )
    process.exitCode = 1
} else {
    if (hasMerge) git('commit', '--no-edit')
    git('push', 'origin', `HEAD:refs/heads/${branch}`)
    summary(`Synced ${upstream}/${branch}; fork changes and workflows retained.`)
    await publishForkRelease(await api(`/repos/${upstream}/releases/latest`))
    summary('Published this fork source and compiled ZIP. No upstream attachments copied; no Docker images published.')
}
