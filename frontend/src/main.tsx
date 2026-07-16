import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 빌드 시 정적 프리렌더된 HTML을 하이드레이션한다.
// (첫 HTML에 계산기·설명 콘텐츠가 담겨 크롤러가 본문을 즉시 수신)
hydrateRoot(
  document.getElementById('root')!,
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
