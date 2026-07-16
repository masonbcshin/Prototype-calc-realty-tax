import React from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

// 빌드 시 Node에서 앱을 HTML 문자열로 렌더(프리렌더).
// 클라이언트는 main.tsx의 hydrateRoot로 이 마크업을 이어받는다.
export function render(): string {
  return renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
