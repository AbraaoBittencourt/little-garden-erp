import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const run = useCallback(async () => {
    const id = ++seq.current
    setLoading(true); setError('')
    try { const r = await fn(); if (id === seq.current) setData(r) }
    catch (e) { if (id === seq.current) setError((e as Error).message || 'Erro ao carregar.') }
    finally { if (id === seq.current) setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { void run() }, [run])
  return { data, error, loading, reload: run, setData }
}
