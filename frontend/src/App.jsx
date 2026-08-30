import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GamePlayer from './components/GamePlayer';
import Results from './components/Results';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import CodeGuruBar from './components/CodeGuruBar';
import { useAuth } from './context/AuthContext';
import { CONFIG } from './config';
import { Layers } from 'lucide-react';

/**
 * This service's own title block.
 *
 * Identity and sign-out used to live here as a user chip and a Logout button.
 * They now sit in CodeGuruBar, which is identical in all four services, so
 * moving between them does not change the chrome. What is left here is the one
 * thing specific to this page.
 */
function AppHeader() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <header className="app-header">
      <div
        className="app-header-brand"
        onClick={() => navigate(isAuthenticated ? '/' : '/login')}
      >
        <Layers size={36} style={{ color: 'var(--cg-accent)' }} />
        <h1 style={{ margin: 0 }}>Gamification Engine</h1>
      </div>
    </header>
  );
}

function App() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {isAuthenticated && (
        <CodeGuruBar
          service="gamification"
          portalUrl={CONFIG.PORTAL_URL}
          user={user}
          onSignOut={handleSignOut}
        />
      )}

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
    </>
  );
}

export default App;
