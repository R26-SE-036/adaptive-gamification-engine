import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GamePlayer from './components/GamePlayer';
import Results from './components/Results';
import { Layers } from 'lucide-react';

function App() {
  const navigate = useNavigate();

  return (
    <div className="app-container">
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '40px', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/')}>
        <Layers size={36} color="#60a5fa" />
        <h1 style={{ margin: 0 }}>Code Guru <span>Gamification Engine</span></h1>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/play/:gameType/:conceptTag/:difficulty" element={<GamePlayer />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
