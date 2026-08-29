import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GamePlayer from './components/GamePlayer';
import Results from './components/Results';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { Layers, LogOut, UserCircle } from 'lucide-react';

function AppHeader() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div
        className="app-header-brand"
        onClick={() => navigate(isAuthenticated ? '/' : '/login')}
      >
        <Layers size={36} color="#60a5fa" />
        <h1 style={{ margin: 0 }}>Code Guru <span>Gamification Engine</span></h1>
      </div>

      {isAuthenticated && user && (
        <div className="app-header-user">
          <div className="user-chip">
            <UserCircle size={20} />
            <div>
              <strong>{user.fullName || 'Student'}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Logout
          </button>
        </div>
      )}
    </header>
  );
}

function App() {
  return (
    <div className="app-container">
      <AppHeader />

      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/play/:gameType/:conceptTag/:difficulty" element={<ProtectedRoute><GamePlayer /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
