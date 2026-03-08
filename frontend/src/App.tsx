import { useEffect, useRef, useState } from 'react'
import './App.css'

type GenerationResult = {
  code: string
  mode: string
  latency: string
}

type TaskResponse = {
  task_id: string
}

type TaskStatus = {
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: GenerationResult
  error?: string
}

function App() {
  const [prompt, setPrompt] = useState('')
  const [language, setLanguage] = useState('python')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus['status'] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearPolling()
  }, [])

  const pollTask = async (id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}`)
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || '获取任务状态失败')
      }
      const data = (await response.json()) as TaskStatus
      setStatus(data.status)

      if (data.status === 'completed' && data.result) {
        setResult(data.result)
        setIsPolling(false)
        clearPolling()
        return
      }

      if (data.status === 'failed') {
        setError(data.error ?? '任务失败')
        setIsPolling(false)
        clearPolling()
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取任务状态失败')
      setIsPolling(false)
      clearPolling()
      return
    }

    pollTimerRef.current = setTimeout(() => pollTask(id), 500)
  }

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('请先输入需求描述')
      setResult(null)
      return
    }

    setIsLoading(true)
    setIsPolling(false)
    clearPolling()
    setError(null)
    setResult(null)
    setTaskId(null)
    setStatus('pending')

    try {
      const response = await fetch('/api/generate/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmed,
          language,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || '请求失败')
      }

      const data = (await response.json()) as TaskResponse
      setTaskId(data.task_id)
      setStatus('pending')
      setIsPolling(true)
      pollTask(data.task_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
      setStatus(null)
      setIsPolling(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setPrompt('')
    setResult(null)
    setError(null)
    setTaskId(null)
    setStatus(null)
    setIsLoading(false)
    setIsPolling(false)
    clearPolling()
  }

  const isBusy = isLoading || isPolling

  return (
    <div className="app">
      <header className="app-header">
        <h1>Vibe Coding 前端原型</h1>
        <p>提交任务后轮询状态，体验异步生成流程</p>
      </header>

      <section className="panel">
        <label className="label">需求描述</label>
        <textarea
          className="textarea"
          rows={6}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：生成支持代码高亮的编辑器"
        />
        <div className="row">
          <label className="label">语言</label>
          <select
            className="select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
          </select>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={handleGenerate} disabled={isBusy}>
            {isBusy ? '生成中...' : '提交任务'}
          </button>
          <button className="btn" onClick={handleReset} disabled={isLoading}>
            清空
          </button>
        </div>
      </section>

      <section className="panel">
        <label className="label">生成结果</label>
        <div className="output">
          {error ? <div className="error">{error}</div> : null}
          <div className="meta">
            task: {taskId ?? '-'} | status: {status ?? '-'}
          </div>
          {result ? (
            <pre>{result.code}</pre>
          ) : !error && status ? (
            <span className="placeholder">任务处理中...</span>
          ) : !error ? (
            <span className="placeholder">等待生成</span>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default App