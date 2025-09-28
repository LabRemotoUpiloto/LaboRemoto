import React, { useState } from 'react';
import './HomeScreen.css';
import { SshCredentials } from '../types';
import AnalyzeFileWidget from './AnalyzeFileWidget';

interface HomeScreenProps {
  onConnect: (credentials: SshCredentials) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onConnect }) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleConnect = () => {
    if (host && username) {
      onConnect({ host, port, username, password });
    } else {
      alert("Please fill in host and username.");
    }
  };

  return (
    <div className="home-screen">
      <div className="connect-box">
        <h2>Connect to Host</h2>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP or Hostname"
        />
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(parseInt(e.target.value, 10))}
          placeholder="Port"
        />
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button onClick={handleConnect}>Connect</button>
      </div>
      <div style={{marginTop:'1.5rem', maxWidth:480}}>
        <AnalyzeFileWidget />
      </div>
    </div>
  );
};

export default HomeScreen;
