import { describe, expect, it } from 'vitest'
import { RECEIPT_CATEGORIES, type ReceiptFormInput } from './types'
import {
  parseReceiptFormInput,
  parseReceiptIdInput,
  parseUpdateReceiptInput,
  validateReceiptForm,
} from './validation'

const validForm: ReceiptFormInput = {
  date: '2026-10-16',
  amount: '1234',
  payee: '東京駅',
  category: 'transportation',
  memo: '客先訪問',
}

function errorsOf(overrides: Partial<ReceiptFormInput>) {
  const result = validateReceiptForm({ ...validForm, ...overrides })
  return result.ok ? {} : result.errors
}

describe('validateReceiptForm', () => {
  it('正しい入力を検証済みの項目に変換する', () => {
    expect(validateReceiptForm(validForm)).toStrictEqual({
      ok: true,
      draft: {
        date: '2026-10-16',
        amount: 1234,
        payee: '東京駅',
        category: 'transportation',
        memo: '客先訪問',
      },
    })
  })

  describe('日付', () => {
    it.each([
      ['空', '', '日付を入力してください'],
      ['空白のみ', '   ', '日付を入力してください'],
      ['存在しない日', '2026-02-30', '実在する日付を入力してください'],
      ['区切りが違う', '2026/10/16', '実在する日付を入力してください'],
      [
        'うるう年でない年の 2/29',
        '2025-02-29',
        '実在する日付を入力してください',
      ],
      ['13 月', '2026-13-01', '実在する日付を入力してください'],
      ['0 日', '2026-10-00', '実在する日付を入力してください'],
      ['桁が足りない', '2026-1-16', '実在する日付を入力してください'],
      ['全角数字', '２０２６-１０-１６', '実在する日付を入力してください'],
      ['日付以外の文字列', 'today', '実在する日付を入力してください'],
    ])('%s（%j）は誤り', (_label, date, message) => {
      expect(errorsOf({ date })).toStrictEqual({ date: message })
    })

    it.each([
      ['うるう年の 2/29', '2024-02-29'],
      ['月末', '2026-12-31'],
    ])('%s（%s）を受け付ける', (_label, date) => {
      expect(validateReceiptForm({ ...validForm, date })).toMatchObject({
        ok: true,
        draft: { date },
      })
    })

    it('前後の空白を除いて受け付ける', () => {
      expect(
        validateReceiptForm({ ...validForm, date: ' 2026-10-16 ' }),
      ).toMatchObject({ ok: true, draft: { date: '2026-10-16' } })
    })
  })

  describe('金額', () => {
    const notInteger = '金額は半角数字の整数で入力してください'
    const outOfRange = '金額は 1 円以上 9,999,999 円以下で入力してください'

    it.each([
      ['空', '', '金額を入力してください'],
      ['空白のみ', '  ', '金額を入力してください'],
      ['0', '0', outOfRange],
      ['10000000', '10000000', outOfRange],
      ['20 桁の数字', '12345678901234567890', outOfRange],
      ['20 桁で先頭が 0 以外の大きな値', '99999999999999999999', outOfRange],
      ['小数', '1.5', notInteger],
      ['負の数', '-1', notInteger],
      ['正の符号', '+1', notInteger],
      ['桁区切り', '1,000', notInteger],
      ['全角数字', '１０００', notInteger],
      ['指数表記', '1e3', notInteger],
      ['数字の間の空白', '1 000', notInteger],
    ])('%s（%j）は誤り', (_label, amount, message) => {
      expect(errorsOf({ amount })).toStrictEqual({ amount: message })
    })

    it.each([
      ['1', '1', 1],
      ['9999999', '9999999', 9_999_999],
      ['前後の空白付き', ' 500 ', 500],
      ['先頭の 0 付き', '0001', 1],
    ])('%s（%j）を数値 %d として受け付ける', (_label, amount, expected) => {
      expect(validateReceiptForm({ ...validForm, amount })).toMatchObject({
        ok: true,
        draft: { amount: expected },
      })
    })
  })

  describe('支払先', () => {
    it.each([
      ['空', '', '支払先を入力してください'],
      ['空白のみ', ' \u3000\t ', '支払先を入力してください'],
      ['101 文字', 'あ'.repeat(101), '支払先は 100 文字以内で入力してください'],
      [
        'サロゲートペアで 101 文字',
        '𠮷'.repeat(101),
        '支払先は 100 文字以内で入力してください',
      ],
    ])('%s は誤り', (_label, payee, message) => {
      expect(errorsOf({ payee })).toStrictEqual({ payee: message })
    })

    it('100 文字を受け付ける', () => {
      const payee = 'あ'.repeat(100)
      expect(validateReceiptForm({ ...validForm, payee })).toMatchObject({
        ok: true,
        draft: { payee },
      })
    })

    it('サロゲートペアの文字は 1 文字として数える', () => {
      const payee = '𠮷'.repeat(100)
      expect(validateReceiptForm({ ...validForm, payee })).toMatchObject({
        ok: true,
        draft: { payee },
      })
    })

    it('前後の空白を除いた値を返し、除いた後の長さで判定する', () => {
      const payee = `  ${'あ'.repeat(100)}\u3000`
      expect(validateReceiptForm({ ...validForm, payee })).toMatchObject({
        ok: true,
        draft: { payee: 'あ'.repeat(100) },
      })
    })
  })

  describe('費目', () => {
    it.each([
      ['空', ''],
      ['未定義のコード', 'food'],
      ['日本語ラベル', '交通費'],
      ['大文字違い', 'Transportation'],
    ])('%s（%j）は誤り', (_label, category) => {
      expect(errorsOf({ category })).toStrictEqual({
        category: '費目を選択してください',
      })
    })

    it.each(RECEIPT_CATEGORIES)('%s を受け付ける', (category) => {
      expect(validateReceiptForm({ ...validForm, category })).toMatchObject({
        ok: true,
        draft: { category },
      })
    })
  })

  describe('メモ', () => {
    it.each([
      ['空', '', ''],
      ['空白のみ', '  \u3000 ', ''],
      ['500 文字', 'い'.repeat(500), 'い'.repeat(500)],
      ['前後の空白付き', '  打ち合わせ  ', '打ち合わせ'],
      [
        '前後の空白を除くと 500 文字',
        ` ${'い'.repeat(500)} `,
        'い'.repeat(500),
      ],
    ])('%s を受け付ける', (_label, memo, expected) => {
      expect(validateReceiptForm({ ...validForm, memo })).toMatchObject({
        ok: true,
        draft: { memo: expected },
      })
    })

    it('501 文字は誤り', () => {
      expect(errorsOf({ memo: 'い'.repeat(501) })).toStrictEqual({
        memo: 'メモは 500 文字以内で入力してください',
      })
    })
  })

  it('複数の項目が誤っているとき、すべての項目のメッセージを返す', () => {
    expect(
      validateReceiptForm({
        date: '2026-02-30',
        amount: '1,000',
        payee: ' ',
        category: '',
        memo: 'う'.repeat(501),
      }),
    ).toStrictEqual({
      ok: false,
      errors: {
        date: '実在する日付を入力してください',
        amount: '金額は半角数字の整数で入力してください',
        payee: '支払先を入力してください',
        category: '費目を選択してください',
        memo: 'メモは 500 文字以内で入力してください',
      },
    })
  })

  it('誤りのない項目のメッセージは含めない', () => {
    expect(errorsOf({ amount: '0' })).toStrictEqual({
      amount: '金額は 1 円以上 9,999,999 円以下で入力してください',
    })
  })
})

describe('parseReceiptFormInput', () => {
  it('5 項目がすべて文字列なら、その 5 項目だけを返す', () => {
    expect(parseReceiptFormInput({ ...validForm, extra: 1 })).toStrictEqual(
      validForm,
    )
  })

  it('空文字の項目も形としては受け付ける', () => {
    const empty = { date: '', amount: '', payee: '', category: '', memo: '' }
    expect(parseReceiptFormInput(empty)).toStrictEqual(empty)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['文字列', 'form'],
    ['金額が数値', { ...validForm, amount: 1234 }],
    ['メモが null', { ...validForm, memo: null }],
    ['日付がない', { ...validForm, date: undefined }],
    ['費目がない', { date: '', amount: '', payee: '', memo: '' }],
  ])('%s を拒否する', (_label, input) => {
    expect(() => parseReceiptFormInput(input)).toThrow(Error)
  })
})

describe('parseReceiptIdInput', () => {
  it('空でない文字列の receiptId を返す', () => {
    expect(parseReceiptIdInput({ receiptId: 'r-1', extra: 1 })).toStrictEqual({
      receiptId: 'r-1',
    })
  })

  it.each([
    ['空文字', { receiptId: '' }],
    ['数値', { receiptId: 1 }],
    ['receiptId がない', {}],
    ['null', null],
    ['文字列そのもの', 'r-1'],
  ])('%s を拒否する', (_label, input) => {
    expect(() => parseReceiptIdInput(input)).toThrow(Error)
  })
})

describe('parseUpdateReceiptInput', () => {
  it('receiptId と 5 項目の組を返す', () => {
    expect(
      parseUpdateReceiptInput({
        receiptId: 'r-1',
        form: { ...validForm, extra: 1 },
        extra: 1,
      }),
    ).toStrictEqual({ receiptId: 'r-1', form: validForm })
  })

  it.each([
    ['receiptId が空', { receiptId: '', form: validForm }],
    ['receiptId がない', { form: validForm }],
    ['form がない', { receiptId: 'r-1' }],
    ['form の項目が欠けている', { receiptId: 'r-1', form: { date: '' } }],
    [
      'form の項目が文字列でない',
      { receiptId: 'r-1', form: { ...validForm, amount: 1 } },
    ],
    ['null', null],
  ])('%s を拒否する', (_label, input) => {
    expect(() => parseUpdateReceiptInput(input)).toThrow(Error)
  })
})
