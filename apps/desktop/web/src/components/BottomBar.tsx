import React from 'react';
import './BottomBar.css';
import CameraPanel from './CameraPanel';

interface BottomBarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessionId: string;
}

// Barra inferior con panel de cámara (controlada desde Sidebar)
const BottomBar: React.FC<BottomBarProps> = ({ isOpen, sessionId }) => {
  return (
    <div className={`bottom-bar ${isOpen ? 'open' : 'closed'}`}>
      <div id="bottom-bar-content" className="bb-content" aria-hidden={!isOpen}>
        <div className="bb-panels">
          <div className="bb-panel camera-panel" aria-label="Panel de cámara" style={{ width: '100%' }}>
            <CameraPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BottomBar;
