import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { parseWithAI } from '../ai/aiParser'
import type { AICommand } from '../ai/commands'
import { dispatchTransactionsAutomation, parseTransactionsAutomationCommand } from '../ai/experimentalGuiAutomation'
import type { Bill, Income, Transaction } from '../domain/models'
import { fromDateInputValue } from './date'
import { useAppStore } from '../app/appStore'
import { isTauriRuntime } from '../storage/tauriJsonStore'

export function CommandBar() {
  const { state, dispatch } = useAppStore()
  const [input, setInput] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const enableGuiAutomation =
    (import.meta.env.DEV && import.meta.env.VITE_ENABLE_AI_GUI !== '0') || import.meta.env.VITE_ENABLE_AI_GUI === '1'
  const canRun = useMemo(() => input.trim().length > 0 && !isParsing, [input, isParsing])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let unsub: (() => void) | null = null
    void listen('touchbar:parse', () => {
      if (input.trim().length === 0) return
      void runParse()
    }).then((u) => {
      unsub = u
    })
    return () => {
      unsub?.()
    }
  }, [input])

  async function runParse() {
    setIsParsing(true)
    try {
      if (enableGuiAutomation) {
        const req = parseTransactionsAutomationCommand(input)
        if (req) {
          dispatch({ type: 'ui/setSection', section: 'transactions' })
          dispatchTransactionsAutomation(req)
          setInput('')
          return
        }
      }
      const parsed = await parseWithAI(input, state.settings)
      applyCommand(parsed.command)
      setInput('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      window.alert('AI parsing failed: ' + msg)
    } finally {
      setIsParsing(false)
    }
  }

  async function runWebSearch(query: string) {
    const q = String(query || '').trim()
    if (!q) {
      window.alert('Missing search query.')
      return
    }
    const ddgApi = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
    try {
      const ctrl = new AbortController()
      const t = window.setTimeout(() => ctrl.abort(), 10_000)
      try {
        const res = await fetch(ddgApi, { method: 'GET', signal: ctrl.signal })
        if (!res.ok) throw new Error(`Search error: ${res.status}`)
        const data = (await res.json()) as any
        const lines: string[] = []
        const abstract = String(data?.AbstractText ?? '').trim()
        if (abstract) lines.push(abstract)
        const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : []
        const flat: Array<{ Text: string; FirstURL: string }> = []
        for (const item of related) {
          if (item && Array.isArray((item as any).Topics)) {
            for (const t2 of (item as any).Topics) flat.push({ Text: String(t2?.Text ?? ''), FirstURL: String(t2?.FirstURL ?? '') })
          } else {
            flat.push({ Text: String((item as any)?.Text ?? ''), FirstURL: String((item as any)?.FirstURL ?? '') })
          }
          if (flat.length >= 8) break
        }
        const top = flat
          .map((x) => ({ text: String(x.Text || '').trim(), url: String(x.FirstURL || '').trim() }))
          .filter((x) => x.text && x.url)
          .slice(0, 5)
        if (top.length) {
          if (lines.length) lines.push('')
          lines.push('Top results:')
          for (let i = 0; i < top.length; i += 1) {
            lines.push(`${i + 1}. ${top[i]!.text}\n${top[i]!.url}`)
          }
        }
        if (!lines.length) {
          window.alert(`No results.\n\nOpen:\nhttps://duckduckgo.com/?q=${encodeURIComponent(q)}`)
          return
        }
        window.alert(lines.join('\n\n'))
      } finally {
        window.clearTimeout(t)
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? 'Search failed')
      window.alert(`${msg}\n\nOpen:\nhttps://duckduckgo.com/?q=${encodeURIComponent(q)}`)
    }
  }

  function applyCommand(cmd: AICommand) {
    if (cmd.type === 'createTransaction') {
      const p = cmd.payload
      const t: Transaction = {
        id: crypto.randomUUID(),
        kind: p.kind,
        date: new Date(),
        amount: { currencyCode: p.currencyCode ?? state.settings.displayCurrencyCode, value: Math.abs(p.amount) },
        accountId: state.accounts.find((a) => !a.archived)?.id ?? null,
        toAccountId: null,
        category: p.category ?? (p.kind === 'expense' ? 'other' : null),
        customCategoryName: p.customCategoryName ?? null,
        payee: p.payee ?? null,
        notes: p.notes ?? null,
        tags: ['ai'],
        relatedBillId: null,
        relatedIncomeId: null,
      }
      dispatch({ type: 'transactions/add', transaction: t })
      dispatch({ type: 'ui/setSection', section: 'transactions' })
      dispatch({ type: 'ui/selectTransaction', id: t.id })
      return
    }
    if (cmd.type === 'createBill') {
      const p = cmd.payload
      const due = p.dueDate ? fromDateInputValue(p.dueDate) : new Date()
      const b: Bill = {
        id: crypto.randomUUID(),
        name: p.name,
        amount: { currencyCode: p.currencyCode ?? state.settings.displayCurrencyCode, value: Math.abs(p.amount) },
        category: p.category ?? 'other',
        customCategoryName: p.customCategoryName ?? null,
        recurrence: 'monthly',
        nextDueDate: due,
        notes: null,
        payments: [],
        paidAutomatically: false,
        hiddenUntilEdited: false,
        snoozeUntil: null,
        snoozeCount: 0,
        attachments: [],
      }
      dispatch({ type: 'bills/add', bill: b })
      dispatch({ type: 'ui/setSection', section: 'bills' })
      dispatch({ type: 'ui/selectBill', id: b.id })
      return
    }
    if (cmd.type === 'createIncome') {
      const p = cmd.payload
      const d = p.nextPayDate ? fromDateInputValue(p.nextPayDate) : new Date()
      const i: Income = {
        id: crypto.randomUUID(),
        name: p.name,
        amount: { currencyCode: p.currencyCode ?? state.settings.displayCurrencyCode, value: Math.abs(p.amount) },
        source: 'other',
        customSourceName: null,
        recurrence: 'monthly',
        nextPayDate: d,
        notes: null,
        receipts: [],
      }
      dispatch({ type: 'incomes/add', income: i })
      dispatch({ type: 'ui/setSection', section: 'income' })
      dispatch({ type: 'ui/selectIncome', id: i.id })
      return
    }
    if (cmd.type === 'webSearch') {
      void runWebSearch(cmd.payload.query)
      return
    }
    window.alert(cmd.payload.message)
  }

  return (
    <div className="cmdBar">
      <input
        className="cmdInput"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Command: pay | schedule | income | expense"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void runParse()
        }}
      />
      <button type="button" className="cmdButton" onClick={() => void runParse()} disabled={!canRun}>
        {isParsing ? 'Parsing…' : 'Parse'}
      </button>
    </div>
  )
}
