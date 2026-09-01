import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../config';
import { Layers, LogIn, Mail, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
    const { login, isAuthenticated, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const redirectTo = location.state?.from || '/';

    if (!loading && isAuthenticated) {
        return <Navigate to={redirectTo} replace />;
    }

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(email.trim(), password);
            navigate(redirectTo, { replace: true });
        } catch (err) {
            setError(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ maxWidth: '480px', margin: '60px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <Layers size={48} color="#8b5cf6" />
                </div>
                <h2 style={{ marginBottom: '8px' }}>Sign in to Code Guru</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Use the same email and password from Code Coach. Your game is chosen from your real coding diagnostics.
                </p>
            </div>

            <div className="glass-panel">
                <form onSubmit={handleSubmit} className="auth-form">
                    <label className="form-label" htmlFor="email">
                        <Mail size={16} />
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        className="form-input"
                        placeholder="student@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />

                    <label className="form-label" htmlFor="password">
                        <Lock size={16} />
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        className="form-input"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        minLength={8}
                        required
                    />

                    {error && (
                        <div className="auth-error">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button type="submit" className="btn" style={{ width: '100%', marginTop: '8px' }} disabled={submitting}>
                        <LogIn size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                        {submitting ? 'Signing in...' : 'Sign In with Code Coach'}
                    </button>
                </form>
            </div>
        </div>
    );
}
