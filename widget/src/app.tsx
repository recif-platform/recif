import { h, render } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'

interface Message {
  role: 'user' | 'agent' | 'thinking'
  content: string
}

interface WidgetConfig {
  agentId: string
  apiKey?: string
  theme?: 'frost-cyan' | 'frost-magenta' | 'dual-neon'
  corailUrl?: string
}

const themeColors = {
  'frost-cyan': { accent: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' },
  'frost-magenta': { accent: '#d946ef', bg: 'rgba(217, 70, 239, 0.1)' },
  'dual-neon': { accent: 'linear-gradient(135deg, #06b6d4, #d946ef)', bg: 'rgba(6, 182, 212, 0.05)' },
}

function ChatWidget({ config }: { config: WidgetConfig }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const theme = themeColors[config.theme || 'frost-cyan']

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'thinking', content: 'Thinking...' }])

    try {
      const url = `${config.corailUrl || 'http://localhost:8000'}/api/v1/agents/${config.agentId}/chat`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: userMsg }),
      })
      const text = await res.text()
      const outputMatch = text.match(/"output":"([^"]*)"/)
      const output = outputMatch ? outputMatch[1] : text

      setMessages(prev => prev.filter(m => m.role !== 'thinking').concat({ role: 'agent', content: output }))
    } catch {
      setMessages(prev => prev.filter(m => m.role !== 'thinking').concat({ role: 'agent', content: 'Error: Unable to reach agent.' }))
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px',
          borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: '24px',
          background: theme.accent, color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}
      >
        💬
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', width: '380px', height: '520px',
      borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(0,0,0,0.1)',
      }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Récif Agent</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%',
            padding: '10px 14px', borderRadius: '16px', fontSize: '13px', lineHeight: '1.4',
            background: m.role === 'user' ? theme.accent : m.role === 'thinking' ? '#f0f0f0' : theme.bg,
            color: m.role === 'user' ? 'white' : '#333',
            opacity: m.role === 'thinking' ? 0.6 : 1, fontStyle: m.role === 'thinking' ? 'italic' : 'normal',
          }}>
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px', borderTop: '1px solid rgba(0,0,0,0.1)', display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          disabled={loading}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.15)',
            outline: 'none', fontSize: '13px', background: 'rgba(255,255,255,0.6)',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: '10px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, background: theme.accent, color: 'white',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export function mount(container: HTMLElement, config: WidgetConfig) {
  const shadow = container.attachShadow({ mode: 'open' })
  const root = document.createElement('div')
  shadow.appendChild(root)
  render(h(ChatWidget, { config }), root)
}

export function app() {
  // Auto-mount from script tag data attributes
  const script = document.currentScript
  if (script) {
    const config: WidgetConfig = {
      agentId: script.getAttribute('data-agent-id') || '',
      apiKey: script.getAttribute('data-api-key') || undefined,
      theme: (script.getAttribute('data-theme') as WidgetConfig['theme']) || 'frost-cyan',
      corailUrl: script.getAttribute('data-corail-url') || undefined,
    }
    if (config.agentId) {
      const container = document.createElement('div')
      container.id = 'recif-widget'
      document.body.appendChild(container)
      mount(container, config)
    }
  }
}
