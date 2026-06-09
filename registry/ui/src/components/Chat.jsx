import { useState } from 'react';
import { Send, Loader } from 'lucide-react';

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Welcome to A2A Multi-Agent System! Ask me a legal question.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'agent', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'error', content: `Error: ${data.error || 'Unknown error'}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: `Network error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">A2A Client Chat</div>
      
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-row ${msg.role === 'user' ? 'row-user' : 'row-agent'}`}>
            <div className={`chat-bubble ${msg.role}`}>
              {msg.role === 'system' && <div className="chat-role">System</div>}
              {msg.role === 'agent' && <div className="chat-role">Customer Agent</div>}
              <div className="chat-content">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-row row-agent">
            <div className="chat-bubble loading">
              <Loader className="spinner" size={16} />
              <span>Agent is typing...</span>
            </div>
          </div>
        )}
      </div>

      <div className="suggestions-container custom-scrollbar">
        <div className="suggestions-scroll">
          {[
            "If a company breaks a contract and avoids taxes, what are the legal consequences?",
            "What is the liability for a CEO involved in money laundering?",
            "Can you explain the SEC compliance rules for a new startup?",
            "What happens if an employee steals corporate trade secrets?"
          ].map((q, idx) => (
            <button 
              key={idx}
              type="button"
              onClick={() => setInput(q)}
              className="suggestion-btn"
              title={q}
            >
              {q.substring(0, 35)}...
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSend} className="chat-form">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your legal question..." 
          className="chat-input"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="chat-submit">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
