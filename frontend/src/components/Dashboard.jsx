import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { CONFIG } from '../config';
import { Activity, Target, BrainCircuit, PlayCircle, Flame, Award } from 'lucide-react';

const Dashboard = () => {
    const [weaknesses, setWeaknesses] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [dashRes, profRes] = await Promise.all([
                    apiService.getDashboard(CONFIG.MOCK_USER_ID),
                    apiService.getProfile(CONFIG.MOCK_USER_ID)
                ]);
                
                const wks = dashRes.data.weaknesses;
                setProfile(profRes.data);

                // Predict difficulty for each weakness using ML Service
                const enriched = await Promise.all(wks.map(async (w) => {
                    try {
                        const difRes = await apiService.predictDifficulty(CONFIG.MOCK_USER_ID, w.conceptTag);
                        return { ...w, predictedDifficulty: difRes.data.predictedDifficulty };
                    } catch {
                        return { ...w, predictedDifficulty: 'Medium' }; // Default fallback
                    }
                }));

                setWeaknesses(enriched);
            } catch (err) {
                console.error("Failed to load dashboard:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: '100px' }}>
             <Activity className="animate-spin" size={48} color="#60a5fa" style={{ animation: 'spin 2s linear infinite'}} />
             <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading AI Insights...</p>
        </div>;
    }

    return (
        <div>
            {/* Player Profile Banner */}
            {profile && (
                <div className="glass-panel profile-banner" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Welcome Back, Coder!</h2>
                        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Total XP: {profile.totalScore}</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                        {/* Streak Tracker */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: 'bold', fontSize: '1.25rem' }}>
                                <Flame size={24} fill={profile.currentStreak > 0 ? '#ef4444' : 'none'} />
                                {profile.currentStreak}
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Day Streak</span>
                        </div>
                        
                        {/* Badges */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {profile.badges && profile.badges.length > 0 ? (
                                profile.badges.map((badge, idx) => (
                                    <div key={idx} style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <Award size={16} color="#f59e0b" />
                                        <span style={{ fontSize: '0.85rem', color: '#fcd34d', fontWeight: '500' }}>{badge}</span>
                                    </div>
                                ))
                            ) : (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '8px' }}>
                                    Play games to earn badges!
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <h2>Your Learning Dashboard</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                Code Coach has identified a few concepts you've been struggling with. 
                Complete targeted games to master them!
            </p>

            <div className="grid-cards">
                {weaknesses.map((w) => (
                    <div className="glass-panel" key={w.conceptTag}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Target color="#f59e0b" size={24} />
                                <h3>{w.conceptTag.replace('_', ' ').toUpperCase()}</h3>
                            </div>
                            <span className={`badge badge-${w.predictedDifficulty?.toLowerCase() || 'medium'}`}>
                                {w.predictedDifficulty || 'Medium'}
                            </span>
                        </div>
                        
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            <BrainCircuit size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }}/>
                            {w.repeatCount} repeated errors detected
                        </p>

                        <div style={{ marginTop: '24px' }}>
                            <button 
                                className="btn" 
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                onClick={() => navigate(`/play/${w.recommendedGame}/${w.conceptTag}/${w.predictedDifficulty}`)}
                            >
                                <PlayCircle size={20} />
                                Play {w.recommendedGame}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {weaknesses.length === 0 && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                    <h3>You're all caught up!</h3>
                    <p>No repeated struggles detected in your Code Coach sessions.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
