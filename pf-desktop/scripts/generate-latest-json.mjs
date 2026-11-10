import fs from 'node:fs'
import path from 'node:path'

function arg(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

const tag = arg('--tag')
if (!tag) {
  console.error('Usage: node scripts/generate-latest-json.mjs --tag v0.1.2 [--out latest.json] [--repo owner/repo] [--mac <file> --mac-sig <file>] [--msi <file> --msi-sig <file>]')
  process.exit(1)
}

const outPath = arg('--out') ?? 'latest.json'
const repo = arg('--repo') ?? 'Litas-dev/Kivana'

const root = path.resolve(process.cwd(), 'src-tauri', 'target', 'release', 'bundle')
const macosDir = path.join(root, 'macos')
const msiDir = path.join(root, 'msi')

function readSig(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim()
}

function findOne(dir, predicate) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  const hit = files.find(predicate)
  return hit ? path.join(dir, hit) : null
}

function resolvePath(p) {
  if (!p) return null
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

const macBundle = resolvePath(arg('--mac')) ?? findOne(macosDir, (f) => f.endsWith('.app.tar.gz'))
const macSig =
  resolvePath(arg('--mac-sig')) ??
  (macBundle ? findOne(macosDir, (f) => f === path.basename(macBundle) + '.sig') : null)

const msiBundle = resolvePath(arg('--msi')) ?? findOne(msiDir, (f) => f.toLowerCase().endsWith('.msi'))
const msiSig =
  resolvePath(arg('--msi-sig')) ??
  (msiBundle ? findOne(msiDir, (f) => f === path.basename(msiBundle) + '.sig') : null)

const platforms = {}

if (macBundle && macSig) {
  platforms['darwin-aarch64'] = {
    url: `https://github.com/${repo}/releases/download/${tag}/${path.basename(macBundle)}`,
    signature: readSig(macSig),
  }
}

if (msiBundle && msiSig) {
  platforms['windows-x86_64'] = {
    url: `https://github.com/${repo}/releases/download/${tag}/${path.basename(msiBundle)}`,
    signature: readSig(msiSig),
  }
}

const platformKeys = Object.keys(platforms)
if (platformKeys.length === 0) {
  console.error(
    `No updater bundles found.\nExpected:\n- ${macosDir}/*.app.tar.gz (+ .sig)\n- ${msiDir}/*.msi (+ .sig)\n\nMake sure bundle.createUpdaterArtifacts=true and TAURI_SIGNING_PRIVATE_KEY is set when building.`,
  )
  process.exit(1)
}

const json = {
  version: tag.startsWith('v') ? tag.slice(1) : tag,
  pub_date: new Date().toISOString(),
  notes: '',
  platforms,
}

fs.writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n', 'utf8')
console.log(`Wrote ${outPath} with platforms: ${platformKeys.join(', ')}`)
