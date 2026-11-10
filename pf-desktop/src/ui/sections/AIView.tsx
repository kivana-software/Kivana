import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import { parseWithAI } from '../../ai/aiParser'
import type { AICommand } from '../../ai/commands'
import { loadCommandMemory, saveCommandMemory, type CommandMemoryItem } from '../../storage/commandMemory'
import type { Bill, Income, Transaction } from '../../domain/models'
import { fromDateInputValue, toDateInputValue } from '../date'

export function AIView() {
  const { state, dispatch } = useAppStore()
  const [input, setInput] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [result, setResult] = useState<{ command: AICommand; raw: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [memory, setMemory] = useState<CommandMemoryItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const mem = await loadCommandMemory()
      if (cancelled) return
      setMemory(mem.items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50))
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const canRun = useMemo(() => input.trim().length > 0 && !isParsing, [input, isParsing])

  async function runParse() {
    setError(null)
    setIsParsing(true)
    try {
      const parsed = await parseWithAI(input, state.settings)
      setResult({ command: parsed.command, raw: parsed.raw })

      const mem = await loadCommandMemory()
      const item: CommandMemoryItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        input,
        command: parsed.command,
        raw: parsed.raw,
        favorite: false,
      }
      const next = { version: 1 as const, items: [item, ...mem.items].slice(0, 200) }
      await saveCommandMemory(next)
      setMemory(next.items.slice(0, 50))
    } catch (e: any) {
      setError(String(e?.message ?? e ?? 'Unknown error'))
      setResult(null)
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

  function toggleFavorite(id: string) {
    void (async () => {
      const mem = await loadCommandMemory()
      const nextItems = mem.items.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i))
      const next = { version: 1 as const, items: nextItems }
      await saveCommandMemory(next)
      setMemory(nextItems.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50))
    })()
  }

  return (
    <>
      <div className="form">
        <label className="field">
          <div className="fieldLabel">Command</div>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder='e.g. "spent 25 on groceries"' />
        </label>
        <div className="rowActions">
          <button type="button" onClick={() => void runParse()} disabled={!canRun}>
            {isParsing ? 'Parsing…' : 'Parse'}
          </button>
          <button type="button" onClick={() => setInput('')}>
            Clear
          </button>
        </div>
        {error ? <div className="note">{error}</div> : null}

        {result ? (
          <div className="field">
            <div className="fieldLabel">Preview</div>
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result.command, null, 2)}
            </div>
            <div className="rowActions" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => applyCommand(result.command)}>
                Apply
              </button>
            </div>
          </div>
        ) : null}

        <div className="field">
          <div className="fieldLabel">Recent</div>
          {memory.length === 0 ? (
            <div className="note">No commands yet.</div>
          ) : (
            memory.map((m) => (
              <div key={m.id} className="note" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {toDateInputValue(new Date(m.createdAt))} • {m.input}
                </div>
                <button type="button" onClick={() => toggleFavorite(m.id)} style={{ padding: '2px 8px' }}>
                  {m.favorite ? '★' : '☆'}
                </button>
                <button type="button" onClick={() => applyCommand(m.command)} style={{ padding: '2px 8px' }}>
                  Apply
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
