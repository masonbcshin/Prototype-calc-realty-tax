/**
 * API 클라이언트
 */

const API_BASE = '/api/v1'

interface CapitalGainsInput {
  acquisitionDate: string
  acquisitionPrice: number
  dispositionDate: string
  dispositionPrice: number
  address: string
  ownerCount: number
  isPrimaryResidence?: boolean
  residenceYears?: number
  necessaryExpenses?: number
  shareRatio?: number
}

interface AcquisitionTaxInput {
  acquisitionPrice: number
  address: string
  ownerCount: number
  isResidential?: boolean
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

export async function calculateCapitalGainsTax(input: CapitalGainsInput) {
  const response = await fetch(`${API_BASE}/calc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const result: ApiResponse<{
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
  }> = await response.json()

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || '계산 실패')
  }

  return result.data
}

export async function calculateAcquisitionTax(input: AcquisitionTaxInput) {
  const response = await fetch(`${API_BASE}/calc/acquisition-tax`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const result: ApiResponse<{
    tax: number
    rate: number
    isAdjustedArea: boolean
    notes: string
  }> = await response.json()

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || '계산 실패')
  }

  return result.data
}

export function formatCurrency(amount: number): string {
  if (amount === 0) return '0원'
  
  const absAmount = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  
  if (absAmount >= 100000000) {
    const billions = Math.floor(absAmount / 100000000)
    const remainder = absAmount % 100000000
    if (remainder === 0) {
      return `${sign}${billions}억원`
    }
    const millions = Math.floor(remainder / 10000)
    return `${sign}${billions}억 ${millions.toLocaleString()}만원`
  }
  
  if (absAmount >= 10000) {
    const millions = Math.floor(absAmount / 10000)
    return `${sign}${millions.toLocaleString()}만원`
  }
  
  return `${sign}${absAmount.toLocaleString()}원`
}
