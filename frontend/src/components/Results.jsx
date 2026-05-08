import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Clock, Lightbulb, Target, ArrowRight } from 'lucide-react';

const Results = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state;

    if (!state) {
        return <div>No results found. <button onClick={() => navigate('/')}>Go Home</button></div>;
    }

    const { result, conceptTag, attemptCount, hintLevel, time } = state;

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <Trophy size={64} color={result.score > 50 ? "#f59e0b" : "#94a3b8"} style={{ margin: '0 auto 24px auto' }} />
            <h2 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{result.score} Points</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Code Guru Gamification Engine</p>

            <div className="glass-panel" style={{ textAlign: 'left', marginBottom: '32px' }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px', marginBottom: '16px' }}>Session Breakdown</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}><Target size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Concept</span>
                        <span style={{ fontWeight: 500 }}>{conceptTag}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}><Clock size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Time Taken</span>
                        <span style={{ fontWeight: 500 }}>{time} seconds</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}><Lightbulb size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Hints Used</span>
                        <span style={{ fontWeight: 500 }}>{hintLevel} / 3 (-{hintLevel * 15} pts)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}><Target size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Attempts</span>
                        <span style={{ fontWeight: 500 }}>{attemptCount} (-{(attemptCount - 1) * 10} pts)</span>
                    </div>
                </div>
            </div>

            <div className="hint-box" style={{ textAlign: 'left', borderLeftColor: 'var(--accent-color)', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)' }}>
                <strong>System Notice:</strong> Performance signal sent to Student Progress Tracker (Study Guider).
            </div>

            <button className="btn" style={{ marginTop: '32px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} onClick={() => navigate('/')}>
                Back to Dashboard <ArrowRight size={18} />
            </button>
        </div>
    );
};

export default Results;
