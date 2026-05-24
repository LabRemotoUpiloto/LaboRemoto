import React from 'react';
import ChatPane from '../../components/ChatPane';
import './AgentLanding.css';

interface LandingPageProps {
  onStartTutorial?: () => void;
  onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
  return (
    <div className="agent-landing">
      <div className="agent-landing__glow" aria-hidden />
      <ChatPane
        sessionId={null}
        layout="home"
        onOpenPanel={onOpenPanel}
        onStartTutorial={onStartTutorial}
      />
    </div>
  );
};

export default LandingPage;
