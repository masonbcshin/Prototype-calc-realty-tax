import { useState } from 'react'
import { calculateCapitalGainsTax, calculateAcquisitionTax, formatCurrency } from '../services/api'

interface TaxCalculatorProps {
  type: 'capital' | 'acquisition'
}

interface CapitalGainsResult {
  taxBeforeSurtax: number
  surtax: number
  totalTax: number
  applies: {
    oneHouseExemption: boolean
    longHoldDeduction: number
    isAdjustedArea: boolean
    multiHouseSurtax: boolean
    shortTermSurtax: boolean
  }
  details: {
    holdingPeriodYears: number
    taxableGain: number
    deductions: number
    taxBase: number
  }
  sourceExcerpt?: string
  notes: string
}

interface AcquisitionTaxResult {
  tax: number
  rate: number
  isAdjustedArea: boolean
  notes: string
}

function TaxCalculator({ type }: TaxCalculatorProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capitalResult, setCapitalResult] = useState<CapitalGainsResult | null>(null)
  const [acquisitionResult, setAcquisitionResult] = useState<AcquisitionTaxResult | null>(null)

  // 양도소득세 폼 데이터
  const [capitalForm, setCapitalForm] = useState({
    acquisitionDate: '2016-01-01',
    acquisitionPrice: 350000000,
    dispositionDate: '2026-01-01',
    dispositionPrice: 500000000,
    address: '서울특별시 강남구',
    ownerCount: 1,
    isPrimaryResidence: true,
    residenceYears: 2,
    shareRatio: 1
  })

  // 취득세 폼 데이터
  const [acquisitionForm, setAcquisitionForm] = useState({
    acquisitionPrice: 500000000,
    address: '서울특별시 강남구',
    ownerCount: 1,
    isResidential: true
  })

  const handleCapitalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setCapitalResult(null)

    try {
      const result = await calculateCapitalGainsTax(capitalForm)
      setCapitalResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '계산 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleAcquisitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setAcquisitionResult(null)

    try {
      const result = await calculateAcquisitionTax(acquisitionForm)
      setAcquisitionResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '계산 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (type === 'acquisition') {
    return (
      <div className="container">
        <div className="card">
          <h2>취득세 계산</h2>
          <form onSubmit={handleAcquisitionSubmit}>
            <div className="form-group">
              <label>취득가액 (원)</label>
              <input
                type="number"
                value={acquisitionForm.acquisitionPrice}
                onChange={e => setAcquisitionForm({
                  ...acquisitionForm,
                  acquisitionPrice: parseInt(e.target.value) || 0
                })}
                required
              />
            </div>

            <div className="form-group">
              <label>주소 (시군구)</label>
              <input
                type="text"
                value={acquisitionForm.address}
                onChange={e => setAcquisitionForm({
                  ...acquisitionForm,
                  address: e.target.value
                })}
                placeholder="예: 서울특별시 강남구"
                required
              />
            </div>

            <div className="form-group">
              <label>보유 주택 수</label>
              <select
                value={acquisitionForm.ownerCount}
                onChange={e => setAcquisitionForm({
                  ...acquisitionForm,
                  ownerCount: parseInt(e.target.value)
                })}
              >
                <option value={1}>1주택 (신규)</option>
                <option value={2}>2주택</option>
                <option value={3}>3주택 이상</option>
              </select>
            </div>

            <div className="form-group">
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="isResidential"
                  checked={acquisitionForm.isResidential}
                  onChange={e => setAcquisitionForm({
                    ...acquisitionForm,
                    isResidential: e.target.checked
                  })}
                />
                <label htmlFor="isResidential">주거용 부동산</label>
              </div>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? '계산 중...' : '취득세 계산하기'}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="card result-card">
          <h2>계산 결과</h2>

          {loading && (
            <div className="loading">
              <div className="spinner"></div>
              <p>계산 중입니다...</p>
            </div>
          )}

          {acquisitionResult && (
            <div className="result-section">
              <div className="result-item total">
                <span className="label">취득세</span>
                <span className="value">{formatCurrency(acquisitionResult.tax)}</span>
              </div>
              
              <div className="result-item">
                <span className="label">적용 세율</span>
                <span className="value">{acquisitionResult.rate}%</span>
              </div>
              
              <div className="result-item">
                <span className="label">조정대상지역</span>
                <span className="value">
                  {acquisitionResult.isAdjustedArea ? (
                    <span className="badge warning">해당</span>
                  ) : (
                    <span className="badge success">비해당</span>
                  )}
                </span>
              </div>

              <div className="info-box">
                {acquisitionResult.notes}
              </div>
            </div>
          )}

          {!loading && !acquisitionResult && (
            <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>
              입력 정보를 작성하고 계산하기 버튼을 클릭하세요.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h2>양도소득세 계산</h2>
        <form onSubmit={handleCapitalSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>취득일</label>
              <input
                type="date"
                value={capitalForm.acquisitionDate}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  acquisitionDate: e.target.value
                })}
                required
              />
            </div>
            <div className="form-group">
              <label>양도일</label>
              <input
                type="date"
                value={capitalForm.dispositionDate}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  dispositionDate: e.target.value
                })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>취득가액 (원)</label>
              <input
                type="number"
                value={capitalForm.acquisitionPrice}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  acquisitionPrice: parseInt(e.target.value) || 0
                })}
                required
              />
            </div>
            <div className="form-group">
              <label>양도가액 (원)</label>
              <input
                type="number"
                value={capitalForm.dispositionPrice}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  dispositionPrice: parseInt(e.target.value) || 0
                })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>주소 (시군구)</label>
            <input
              type="text"
              value={capitalForm.address}
              onChange={e => setCapitalForm({
                ...capitalForm,
                address: e.target.value
              })}
              placeholder="예: 서울특별시 강남구"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>보유 주택 수</label>
              <select
                value={capitalForm.ownerCount}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  ownerCount: parseInt(e.target.value)
                })}
              >
                <option value={1}>1주택</option>
                <option value={2}>2주택</option>
                <option value={3}>3주택 이상</option>
              </select>
            </div>
            <div className="form-group">
              <label>거주 기간 (년)</label>
              <input
                type="number"
                value={capitalForm.residenceYears}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  residenceYears: parseInt(e.target.value) || 0
                })}
                min={0}
              />
            </div>
          </div>

          <div className="form-group">
            <label>공동명의 지분비율 (단독명의는 100%)</label>
            <select
              value={capitalForm.shareRatio}
              onChange={e => setCapitalForm({
                ...capitalForm,
                shareRatio: parseFloat(e.target.value)
              })}
            >
              <option value={1}>100% (단독명의)</option>
              <option value={0.5}>50% (부부 공동명의 등)</option>
              <option value={1/3}>33.33% (3인 공동)</option>
              <option value={0.25}>25% (4인 공동)</option>
            </select>
          </div>

          <div className="form-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="isPrimaryResidence"
                checked={capitalForm.isPrimaryResidence}
                onChange={e => setCapitalForm({
                  ...capitalForm,
                  isPrimaryResidence: e.target.checked
                })}
              />
              <label htmlFor="isPrimaryResidence">실거주 (1세대1주택 비과세 요건)</label>
            </div>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? '계산 중...' : '양도소득세 계산하기'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="card result-card">
        <h2>계산 결과</h2>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>계산 중입니다...</p>
          </div>
        )}

        {capitalResult && (
          <div className="result-section">
            <div className="result-item total">
              <span className="label">총 납부세액</span>
              <span className="value">{formatCurrency(capitalResult.totalTax)}</span>
            </div>
            
            <div className="result-item">
              <span className="label">기본 세액</span>
              <span className="value">{formatCurrency(capitalResult.taxBeforeSurtax)}</span>
            </div>
            
            <div className="result-item">
              <span className="label">중과세액</span>
              <span className="value">{formatCurrency(capitalResult.surtax)}</span>
            </div>
            
            <div className="result-item">
              <span className="label">보유기간</span>
              <span className="value">{capitalResult.details.holdingPeriodYears}년</span>
            </div>
            
            <div className="result-item">
              <span className="label">양도차익</span>
              <span className="value">{formatCurrency(capitalResult.details.taxableGain)}</span>
            </div>
            
            <div className="result-item">
              <span className="label">과세표준</span>
              <span className="value">{formatCurrency(capitalResult.details.taxBase)}</span>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {capitalResult.applies.oneHouseExemption && (
                <span className="badge success">1세대1주택 비과세</span>
              )}
              {capitalResult.applies.longHoldDeduction > 0 && (
                <span className="badge success">장기보유공제 {(capitalResult.applies.longHoldDeduction * 100).toFixed(0)}%</span>
              )}
              {capitalResult.applies.isAdjustedArea && (
                <span className="badge warning">조정대상지역</span>
              )}
              {capitalResult.applies.multiHouseSurtax && (
                <span className="badge danger">다주택 중과</span>
              )}
              {capitalResult.applies.shortTermSurtax && (
                <span className="badge danger">단기매매 중과</span>
              )}
            </div>

            {capitalResult.sourceExcerpt && (
              <div className="info-box">
                <strong>근거 조문 발췌</strong>
                <p>{capitalResult.sourceExcerpt}</p>
              </div>
            )}

            <div className="info-box">
              {capitalResult.notes}
            </div>
          </div>
        )}

        {!loading && !capitalResult && (
          <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>
            입력 정보를 작성하고 계산하기 버튼을 클릭하세요.
          </p>
        )}
      </div>
    </div>
  )
}

export default TaxCalculator
