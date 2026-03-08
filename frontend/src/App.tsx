import { useState, useRef, useEffect } from "react";
import "./App.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function App() {
  // Chat State
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hello! I am your Vibe Coding assistant. Describe what you want to build." }]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Code Preview State
  const [displayedCode, setDisplayedCode] = useState("// Your generated code will appear here...");
  const [fullCode, setFullCode] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Typewriter Effect Logic
  useEffect(() => {
    if (isTyping && fullCode.length > displayedCode.length) {
      const timeout = setTimeout(() => {
        setDisplayedCode(fullCode.slice(0, displayedCode.length + 5));
      }, 10);
      return () => clearTimeout(timeout);
    } else if (isTyping && fullCode.length === displayedCode.length) {
      setIsTyping(false);
    }
  }, [displayedCode, fullCode, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsSending(true);
    setDisplayedCode(""); // Clear previous code
    setFullCode("");

    try {
      // 1. Submit Task
      const response = await fetch("/api/generate/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage, language: "python" }),
      });

      if (!response.ok) throw new Error("Failed to start generation");

      const { task_id } = await response.json();

      // 2. Poll for Result
      const pollInterval = setInterval(async () => {
        try {
          const taskRes = await fetch(`/api/tasks/${task_id}`);
          const taskData = await taskRes.json();

          if (taskData.status === "completed" && taskData.result) {
            clearInterval(pollInterval);

            // Start "Streaming" effect
            setFullCode(taskData.result.code);
            setIsTyping(true);

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Code generated! (Latency: ${taskData.result.latency})`,
              },
            ]);
            setIsSending(false);
          } else if (taskData.status === "failed") {
            clearInterval(pollInterval);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Error: ${taskData.error}`,
              },
            ]);
            setIsSending(false);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setIsSending(false);
        }
      }, 1000);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
      setIsSending(false);
    }
  };

  return (
    <div className="app">
      {/* Left Panel: Chat Interface */}
      <div className="chat-panel">
        <div className="chat-header">Vibe Coding Assistant</div>
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {isSending && <div className="message assistant">Thinking & Generating...</div>}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-area">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe your code requirements..."
            rows={1}
          />
          <button className="send-btn" onClick={handleSend} disabled={isSending || !input.trim()}>
            Send
          </button>
        </div>
      </div>

      {/* Right Panel: Code Preview */}
      <div className="preview-panel">
        <div className="preview-header">
          <span className="preview-title">main.py (Generated)</span>
          <button className="copy-btn" onClick={() => navigator.clipboard.writeText(fullCode)}>
            Copy Code
          </button>
        </div>
        <div className="code-editor">
          {displayedCode}
          {isTyping && <span className="cursor">|</span>}
        </div>
      </div>
    </div>
  );
}

export default App;
