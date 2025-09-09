import React from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from './ChatPane';


interface TerminalViewProps {
  sessionId: string;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId }) => {
  return (
    <div className="terminal-view">
      <TerminalPane sessionId={sessionId} />
      <ChatPane sessionId={sessionId} />
    </div>
  );
};

export default TerminalView;
