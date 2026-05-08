import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const version = String(pkg?.version ?? '').trim()
if (!version) throw new Error('package.json version missing')

const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json')
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'))
tauri.version = version
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n')

const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml')
const cargoLines = fs.readFileSync(cargoPath, 'utf8').split('\n')

let inPackage = false
let updated = false
for (let i = 0; i < cargoLines.length; i++) {
  const line = cargoLines[i] ?? ''
  if (line.trim() === '[package]') {
    inPackage = true
    continue
  }
  if (inPackage && line.startsWith('[')) {
    break
  }
  if (inPackage && /^\s*version\s*=/.test(line)) {
    cargoLines[i] = `version = "${version}"`
    updated = true
    break
  }
}

if (!updated) throw new Error('Failed to update src-tauri/Cargo.toml [package] version')

fs.writeFileSync(cargoPath, cargoLines.join('\n'))
console.log(`Synced version ${version}`)
