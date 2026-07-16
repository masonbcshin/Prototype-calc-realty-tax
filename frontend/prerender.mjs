// 빌드-타임 정적 프리렌더
// vite build(클라이언트) + vite build --ssr(서버 엔트리) 후 실행:
// 서버 엔트리를 렌더해 dist/index.html의 <div id="root"></div>에 주입한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const templatePath = resolve('dist/index.html')
const serverEntry = resolve('dist-server/entry-server.js')

if (!existsSync(serverEntry)) {
  console.error(`[prerender] 서버 엔트리를 찾을 수 없습니다: ${serverEntry}`)
  process.exit(1)
}

const template = readFileSync(templatePath, 'utf-8')
const { render } = await import(pathToFileURL(serverEntry).href)
const appHtml = render()

const marker = '<div id="root"></div>'
if (!template.includes(marker)) {
  console.error('[prerender] index.html에서 마운트 지점을 찾지 못했습니다.')
  process.exit(1)
}

const html = template.replace(marker, `<div id="root">${appHtml}</div>`)
writeFileSync(templatePath, html)
console.log('[prerender] dist/index.html에 정적 마크업을 주입했습니다.')
