import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const upstream = 'chiihero/Microsoft-Rewards-Script'
const repository = process.env.SYNC_REPOSITORY
const branch = 'V4-china'
const token = process.env.GH_TOKEN
if (!token || repository !== 'muzi-xiaoren/Microsoft-Rewards-Script') {
    throw new Error('Expected the fork repository and a workflow GH_TOKEN')
}

function git(...args) {
    const result = spawnSync('git', args, { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`)
    return result.stdout.trim()
}

async function api(route, method = 'GET', body) {
    const response = await fetch(`https://api.github.com${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (response.status === 404 && method === 'GET') return null
    if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}: ${await response.text()}`)
    return response.status === 204 ? null : response.json()
}

async function paginated(route) {
    const result = []
    for (let page = 1; ; page++) {
        const items = await api(`${route}?per_page=100&page=${page}`)
        if (!Array.isArray(items)) throw new Error(`Unable to list ${route}`)
        result.push(...items)
        if (items.length < 100) return result
    }
}

function summary(message) {
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

git('config', 'user.name', 'github-actions[bot]')
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
git('remote', 'add', 'upstream', `https://github.com/${upstream}.git`)
git('fetch', '--no-tags', 'upstream', branch)
const upstreamCommit = git('rev-parse', `upstream/${branch}`)
const merge = spawnSync('git', ['merge', '--no-edit', `upstream/${branch}`], { encoding: 'utf8' })
if (merge.status !== 0) {
    git('merge', '--abort')
    const conflictBranch = `sync-upstream/${upstreamCommit.slice(0, 12)}`
    git('push', 'origin', `${upstreamCommit}:refs/heads/${conflictBranch}`)
    const existing = await api(
        `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(repository.split('/')[0] + ':' + conflictBranch)}&base=${branch}`
    )
    const pr =
        existing?.[0] ??
        (await api(`/repos/${repository}/pulls`, 'POST', {
            title: 'Resolve monthly upstream sync conflicts',
            head: conflictBranch,
            base: branch,
            body: `Upstream ${upstream} could not merge cleanly. Resolve the conflicts while preserving the fork's fixes and workflow settings. Upstream commit: ${upstreamCommit}.`
        }))
    summary(`Merge conflicts require review: ${pr.html_url}. No releases were mirrored.`)
    process.exitCode = 1
} else {
    git('push', 'origin', `HEAD:refs/heads/${branch}`)
    summary(`Synced ${upstream}/${branch}; fork changes retained.`)

    const releases = (await paginated(`/repos/${upstream}/releases`))
        .filter(release => !release.draft)
        .sort((a, b) => a.published_at.localeCompare(b.published_at))
    const latest = await api(`/repos/${upstream}/releases/latest`)
    for (const source of releases) {
        const tag = source.tag_name
        const escapedTag = encodeURIComponent(tag)
        let destination = await api(`/repos/${repository}/releases/tags/${escapedTag}`)
        if (!destination) {
            git('check-ref-format', `refs/tags/${tag}`)
            git('fetch', '--no-tags', 'upstream', `refs/tags/${tag}`)
            const tagObject = git('rev-parse', 'FETCH_HEAD')
            const remoteTag = git('ls-remote', 'origin', `refs/tags/${tag}`).split(/\s/)[0]
            if (remoteTag && remoteTag !== tagObject)
                throw new Error(`Tag ${tag} already points to different fork code; refusing to overwrite it`)
            if (!remoteTag) git('push', 'origin', `${tagObject}:refs/tags/${tag}`)
            destination = await api(`/repos/${repository}/releases`, 'POST', {
                tag_name: tag,
                name: source.name || tag,
                body: `Synced from [${upstream}](${source.html_url}). This tag preserves the upstream release source; fork-specific fixes remain on ${branch}.\n\n${source.body || ''}`,
                draft: false,
                prerelease: source.prerelease,
                make_latest: latest?.tag_name === tag ? 'true' : 'false'
            })
            summary(`Mirrored upstream release ${tag}.`)
        }
        const assets = await paginated(`/repos/${repository}/releases/${destination.id}/assets`)
        for (const asset of source.assets) {
            if (assets.some(existing => existing.name === asset.name)) continue
            const download = await fetch(asset.browser_download_url)
            if (!download.ok) throw new Error(`Cannot download asset ${asset.name}: HTTP ${download.status}`)
            const upload = await fetch(
                `https://uploads.github.com/repos/${repository}/releases/${destination.id}/assets?name=${encodeURIComponent(asset.name)}&label=${encodeURIComponent(asset.label || '')}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': asset.content_type || 'application/octet-stream'
                    },
                    body: new Uint8Array(await download.arrayBuffer())
                }
            )
            if (!upload.ok) throw new Error(`Cannot upload asset ${asset.name}: HTTP ${upload.status}`)
        }
    }
    summary('Release metadata, upstream tags and attached assets synchronized. No Docker images built or published.')
}
