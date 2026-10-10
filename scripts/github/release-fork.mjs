import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = process.env.SYNC_REPOSITORY
const token = process.env.GH_TOKEN

function removeTemporaryDirectory(directory) {
    if (
        path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
        !path.basename(directory).startsWith('rewards-release-')
    ) {
        throw new Error('Refusing to remove a directory outside the release temporary workspace')
    }
    fs.rmSync(directory, { recursive: true, force: true })
}

export function command(program, args, options = {}) {
    const result = spawnSync(program, args, { encoding: 'utf8', ...options })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr || result.stdout}`)
    return result.stdout?.trim() ?? ''
}

export async function api(route, method = 'GET', body) {
    if (!token || repository !== 'muzi-xiaoren/Microsoft-Rewards-Script')
        throw new Error('Expected fork repository and GH_TOKEN')
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

export function buildArchive(outputDirectory, tag, commit, upstreamRelease) {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-release-'))
    try {
        const source = path.join(staging, 'source.tar')
        command('git', ['archive', '--format=tar', `--output=${source}`, commit])
        const packageRoot = path.join(staging, 'package')
        fs.mkdirSync(packageRoot)
        command('tar', ['-xf', source, '-C', packageRoot])
        // Package committed source and freshly compiled dist, excluding local runtime files.
        fs.cpSync('dist', path.join(packageRoot, 'dist'), { recursive: true })
        fs.writeFileSync(
            path.join(packageRoot, 'RELEASE-INFO.json'),
            JSON.stringify(
                {
                    repository,
                    tag,
                    commit,
                    upstreamRelease: upstreamRelease?.html_url ?? null,
                    builtAt: new Date().toISOString()
                },
                null,
                2
            ) + '\n'
        )
        fs.mkdirSync(outputDirectory, { recursive: true })
        const archive = path.resolve(outputDirectory, `Microsoft-Rewards-Script-${tag}.zip`)
        command('python3', [
            '-c',
            'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as archive:\n for file in sorted(root.rglob("*")):\n  if file.is_file(): archive.write(file,file.relative_to(root))',
            packageRoot,
            archive
        ])
        command('python3', [
            '-c',
            'import sys,zipfile,json\nwith zipfile.ZipFile(sys.argv[1]) as archive:\n names=archive.namelist()\n assert "dist/index.js" in names and "src/index.ts" in names\n assert not any(name.split("/")[0] in (".env","sessions","config","node_modules","clawbot-auth.json","use.md") for name in names)\n assert json.loads(archive.read("RELEASE-INFO.json"))["commit"] == sys.argv[2]',
            archive,
            commit
        ])
        return archive
    } finally {
        removeTemporaryDirectory(staging)
    }
}

export async function publishForkRelease(upstreamRelease) {
    const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
    const commit = command('git', ['rev-parse', 'HEAD'])
    const tag = `v${version}-fork.${commit.slice(0, 12)}`
    let release = await api(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`)
    const assetName = `Microsoft-Rewards-Script-${tag}.zip`
    if (release?.assets.some(asset => asset.name === assetName)) {
        if (release.draft)
            release = await api(`/repos/${repository}/releases/${release.id}`, 'PATCH', {
                draft: false,
                make_latest: 'true'
            })
        console.log(`Fork release already complete: ${release.html_url}`)
        return release
    }

    command('npm', ['ci', '--ignore-scripts'], { stdio: 'inherit' })
    command('npm', ['run', 'build'], { stdio: 'inherit' })
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'rewards-release-output-'))
    try {
        const archive = buildArchive(output, tag, commit, upstreamRelease)
        if (!release) {
            release = await api(`/repos/${repository}/releases`, 'POST', {
                tag_name: tag,
                target_commitish: commit,
                name: `Microsoft-Rewards-Script ${version} (fork ${commit.slice(0, 12)})`,
                body: `Built from this fork at [${commit}](https://github.com/${repository}/commit/${commit}).\n\nThe ZIP contains this fork's committed source and compiled dist, without credentials, sessions or node_modules. Use Node.js 24+, run \`npm ci --omit=dev --ignore-scripts\` and \`npm run install:browser\`, and configure your own account environment. GitHub's source archives also use this fork tag. No upstream binary assets or Docker images are published.\n\n${upstreamRelease ? `Upstream release: ${upstreamRelease.html_url}\n\n${upstreamRelease.body || ''}` : ''}`,
                draft: true,
                prerelease: false
            })
        }
        const upload = await fetch(
            `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
                body: fs.readFileSync(archive)
            }
        )
        if (!upload.ok) throw new Error(`Archive upload failed: HTTP ${upload.status}`)
        release = await api(`/repos/${repository}/releases/${release.id}`, 'PATCH', {
            draft: false,
            make_latest: 'true'
        })
        console.log(`Fork release published: ${release.html_url}`)
        if (process.env.GITHUB_STEP_SUMMARY)
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Fork source and compiled ZIP: ${release.html_url}\n`)
        return release
    } finally {
        removeTemporaryDirectory(output)
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await publishForkRelease(await api('/repos/chiihero/Microsoft-Rewards-Script/releases/latest'))
}
