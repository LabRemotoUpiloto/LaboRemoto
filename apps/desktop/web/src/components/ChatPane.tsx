import React, { useState } from 'react';
import './ChatPane.css';

type ChatMode = 'ask' | 'agent';

const ChatPane: React.FC = () => {
  const [messages, setMessages] = useState<{ text: string, sender: 'user' | 'ai' }[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');

  const handleSend = () => {
    if (input.trim()) {
      setMessages([...messages, { text: input, sender: 'user' }]);
      // Simulate AI response
      setTimeout(() => {
        setMessages(prev => [...prev, { text: `AI response to: "${input}"`, sender: 'ai' }]);
      }, 1000);
      setInput('');
    }
  };

  const handleNewChat = () => {
    setMessages([]);
  }

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <button onClick={handleNewChat}>New Chat</button>
        <select value={mode} onChange={(e) => setMode(e.target.value as ChatMode)}>
          <option value="ask">Ask Mode</option>
          <option value="agent">Agent Mode</option>
        </select>
      </div>
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default ChatPane;
