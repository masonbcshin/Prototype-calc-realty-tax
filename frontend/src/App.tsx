import { useState } from 'react'
import TaxCalculator from './components/TaxCalculator'
import ContentSections from './components/ContentSections'

function App() {
  const [activeTab, setActiveTab] = useState<'capital' | 'acquisition'>('capital')

  return (
    <div>
      <header>
        <h1>부동산 거래세/양도소득세 계산기</h1>
        <p className="subtitle">법제처 Open API 기반 자동 계산 서비스</p>
      </header>

      <div className="disclaimer">
        <strong>면책 조항</strong>
        이 서비스는 정보제공용이며 법률·세무 자문이 아닙니다.
        실제 신고 전 반드시 세무사·전문가와 상담하세요.
        계산 결과의 정확성을 보장하지 않습니다.
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('capital')}
          style={{ 
            width: 'auto', 
            marginRight: '0.5rem',
            background: activeTab === 'capital' ? '#4299e1' : '#e2e8f0',
            color: activeTab === 'capital' ? 'white' : '#4a5568'
          }}
        >
          양도소득세
        </button>
        <button 
          onClick={() => setActiveTab('acquisition')}
          style={{ 
            width: 'auto',
            background: activeTab === 'acquisition' ? '#4299e1' : '#e2e8f0',
            color: activeTab === 'acquisition' ? 'white' : '#4a5568'
          }}
        >
          취득세
        </button>
      </div>

      <TaxCalculator type={activeTab} />

      <ContentSections />

      <footer>
        <p>법제처 국가법령정보센터 Open API 기반</p>
        <p>데이터 수집은 공개 API 범위 내에서만 수행됩니다.</p>
        <p>&copy; 2026 Real Estate Tax Calculator</p>
      </footer>
    </div>
  )
}

export default App
