'use client'

import { useEffect, useMemo, useState } from 'react'
import { Award, Minus, Play, Plus, RotateCcw } from 'lucide-react'
import {
  ApiError, getProblem, simulate, submitProblem,
  type Circuit, type GateOp, type GateType, type ProblemDetail, type SimulateResult, type SubmitResponse,
} from '@/lib/api'
import { ErrorBox, Loading } from '@/components/shared'

const STEPS = 6
const GATES: { type: GateType; label: string; hint: string }[] = [
  { type: 'H', label: 'Hadamard', hint: 'Creates superposition on one qubit' },
  { type: 'X', label: 'Pauli-X', hint: 'Bit flip' },
  { type: 'Y', label: 'Pauli-Y', hint: 'Bit + phase flip' },
  { type: 'Z', label: 'Pauli-Z', hint: 'Phase flip' },
  { type: 'CNOT', label: 'Controlled-X', hint: 'Click a control qubit, then a target qubit' },
  { type: 'TOFFOLI', label: 'Toffoli', hint: 'Click two control qubits, then a target' },
  { type: 'MEASURE', label: 'Measurement', hint: 'Marks a qubit as measured' },
]

type Pending = { type: 'CNOT' | 'TOFFOLI'; step: number; controls: number[] }

export default function Builder({
  circuit, setCircuit, problemId, isLoggedIn, onSolved,
}: {
  circuit: Circuit
  setCircuit: (c: Circuit) => void
  problemId: string | null
  isLoggedIn: boolean
  onSolved?: () => void
}) {
  const [selected, setSelected] = useState<GateType>('H')
  const [pending, setPending] = useState<Pending | null>(null)

  const [problem, setProblem] = useState<ProblemDetail | null>(null)
  const [problemError, setProblemError] = useState('')

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [simResult, setSimResult] = useState<SimulateResult | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null)

  useEffect(() => {
    setSimResult(null)
    setSubmitResult(null)
    setRunError('')
    setPending(null)
    if (!problemId) { setProblem(null); return }
    setProblemError('')
    getProblem(problemId)
      .then(setProblem)
      .catch(err => setProblemError(err instanceof ApiError ? err.message : 'Could not load this problem.'))
  }, [problemId])

  const gateAt = (q: number, step: number): { symbol: string; pending: boolean } | null => {
    for (const g of circuit.gates) {
      if (g.step !== step) continue
      if (g.type === 'CNOT') {
        if (g.qubit === q) return { symbol: '•', pending: false }
        if (g.target === q) return { symbol: '⊕', pending: false }
      } else if (g.type === 'TOFFOLI') {
        if (g.controls?.includes(q)) return { symbol: '•', pending: false }
        if (g.target === q) return { symbol: '⊕', pending: false }
      } else if (g.qubit === q) {
        return { symbol: g.type === 'MEASURE' ? 'M' : g.type, pending: false }
      }
    }
    if (pending && pending.step === step && pending.controls.includes(q)) {
      return { symbol: '•', pending: true }
    }
    return null
  }

  const removeGateAt = (q: number, step: number): boolean => {
    const idx = circuit.gates.findIndex(g =>
      g.step === step && (g.qubit === q || g.target === q || g.controls?.includes(q))
    )
    if (idx === -1) return false
    setCircuit({ ...circuit, gates: circuit.gates.filter((_, i) => i !== idx) })
    return true
  }

  const handleCellClick = (q: number, step: number) => {
    if (removeGateAt(q, step)) { setPending(null); return }

    const active = pending && pending.step === step ? pending : null

    if (active?.type === 'CNOT') {
      if (q === active.controls[0]) return
      const gate: GateOp = { type: 'CNOT', qubit: active.controls[0], target: q, step }
      setCircuit({ ...circuit, gates: [...circuit.gates, gate] })
      setPending(null)
      return
    }
    if (active?.type === 'TOFFOLI') {
      if (active.controls.includes(q)) return
      if (active.controls.length === 1) {
        setPending({ ...active, controls: [...active.controls, q] })
        return
      }
      const gate: GateOp = { type: 'TOFFOLI', qubit: active.controls[0], controls: active.controls, target: q, step }
      setCircuit({ ...circuit, gates: [...circuit.gates, gate] })
      setPending(null)
      return
    }

    if (selected === 'CNOT' || selected === 'TOFFOLI') {
      setPending({ type: selected, step, controls: [q] })
      return
    }
    const gate: GateOp = { type: selected, qubit: q, step }
    setCircuit({ ...circuit, gates: [...circuit.gates, gate] })
  }

  const changeQubits = (delta: number) => {
    const next = Math.min(6, Math.max(1, circuit.qubits + delta))
    if (next === circuit.qubits) return
    const gates = circuit.gates.filter(g =>
      g.qubit < next && (g.target === undefined || g.target === null || g.target < next) &&
      (!g.controls || g.controls.every(c => c < next))
    )
    setCircuit({ qubits: next, gates })
    setPending(null)
  }

  const clear = () => { setCircuit({ qubits: circuit.qubits, gates: [] }); setPending(null); setSimResult(null); setSubmitResult(null); setRunError('') }

  const run = async () => {
    setRunning(true)
    setRunError('')
    setSimResult(null)
    setSubmitResult(null)
    try {
      if (problemId) {
        if (!isLoggedIn) { setRunError('Log in to submit an answer.'); return }
        const res = await submitProblem(problemId, circuit)
        setSubmitResult(res)
        if (res.correct) onSolved?.()
      } else {
        const res = await simulate(circuit)
        setSimResult(res)
      }
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Could not reach the backend to run this circuit.')
    } finally {
      setRunning(false)
    }
  }

  const displayResult = submitResult?.yourResult ?? simResult

  return <main className="builder-page">
    <div className="builder-head">
      <div>
        <p className="eyebrow">{problemId ? 'PROBLEM' : 'CIRCUIT BUILDER / SANDBOX'}</p>
        <h1>{problem ? problem.title : problemId ? 'Loading…' : 'Make something quantum.'}</h1>
        <p>{problem ? problem.description : 'Place gates on the grid, then run the circuit to see what happens.'}</p>
        {problemError && <ErrorBox message={problemError} />}
        {problem && problem.hints.length > 0 && <details style={{ marginTop: 10 }}>
          <summary className="link-btn" style={{ display: 'inline-flex', cursor: 'pointer' }}>Show hints</summary>
          <ul className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>
            {problem.hints.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </details>}
      </div>
      <div className="builder-actions">
        <button className="outline-btn" onClick={clear}><RotateCcw size={15} /> Clear</button>
        <button className="pill-btn" onClick={run} disabled={running}>
          {running ? 'Running…' : problemId ? 'Submit answer' : 'Run circuit'} <Play size={14} />
        </button>
      </div>
    </div>

    <div className="builder-layout">
      <aside className="gate-palette">
        <p className="muted-label">GATE PALETTE</p>
        {GATES.map(g => (
          <button key={g.type} className={selected === g.type ? 'gate-tool selected' : 'gate-tool'} onClick={() => { setSelected(g.type); setPending(null) }}>
            <b>{g.type === 'MEASURE' ? 'M' : g.type}</b><span>{g.label}</span><Plus size={14} />
          </button>
        ))}
        <div className="palette-tip"><span>{GATES.find(g => g.type === selected)?.hint}</span></div>
        {pending && <div className="palette-tip" style={{ color: 'var(--blue)' }}>
          <span>Click {pending.type === 'CNOT' ? 'the target qubit' : pending.controls.length === 1 ? 'a second control qubit' : 'the target qubit'} at step {pending.step + 1} to finish this {pending.type} gate.</span>
        </div>}
      </aside>

      <section className="circuit-workspace">
        <div className="circuit-toolbar">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => changeQubits(-1)}><Minus size={12} /></button>
            {circuit.qubits} qubit{circuit.qubits === 1 ? '' : 's'}
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => changeQubits(1)}><Plus size={12} /></button>
          </span>
        </div>
        <div className="grid-circuit">
          {Array.from({ length: circuit.qubits }, (_, q) => (
            <div className="grid-row" key={q}>
              <span className="qubit-label">q{q}</span>
              {Array.from({ length: STEPS }, (_, step) => {
                const cell = gateAt(q, step)
                return (
                  <button
                    key={step}
                    className={cell ? 'grid-cell filled' : 'grid-cell'}
                    style={cell?.pending ? { opacity: 0.5 } : undefined}
                    onClick={() => handleCellClick(q, step)}
                  >
                    {cell?.symbol ?? ''}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {runError && <ErrorBox message={runError} />}

        {submitResult && (
          <div className="admin-panel" style={{ margin: '20px 0', borderColor: submitResult.correct ? 'var(--green)' : 'var(--orange)' }}>
            <p style={{ fontWeight: 800, color: submitResult.correct ? 'var(--green)' : 'var(--orange)' }}>
              {submitResult.correct ? '✓ Correct!' : '✗ Not quite — try again'}
            </p>
            {submitResult.xpEarned > 0 && <p className="muted">+{submitResult.xpEarned} XP earned</p>}
            {submitResult.newBadges.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {submitResult.newBadges.map(b => (
                  <p key={b.id} className="muted" style={{ color: 'var(--orange)' }}><Award size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />New badge unlocked: <strong>{b.name}</strong> — {b.description}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {displayResult && <ProbabilityPanel result={displayResult} label={submitResult && !submitResult.correct ? 'Your result' : 'Result'} />}
        {submitResult && !submitResult.correct && submitResult.expectedResult && (
          <ProbabilityPanel result={submitResult.expectedResult} label="Expected result" />
        )}
      </section>
    </div>
  </main>
}

function ProbabilityPanel({ result, label }: { result: SimulateResult; label: string }) {
  const entries = useMemo(
    () => Object.entries(result.probabilities).filter(([, p]) => p > 0.0005).sort(([a], [b]) => a.localeCompare(b)),
    [result]
  )
  return <div className="result-panel">
    <div className="result-title"><div><span className="tag orange">RESULT</span><h2>{label}: probability distribution</h2></div></div>
    <div className="prob-bars" style={{ overflowX: 'auto' }}>
      {entries.map(([state, p]) => (
        <div key={state}>
          <span>|{state}⟩</span>
          <i style={{ height: `${Math.max(2, p * 100)}%` }} />
          <strong>{(p * 100).toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  </div>
}
