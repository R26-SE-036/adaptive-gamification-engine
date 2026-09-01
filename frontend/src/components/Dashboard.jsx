import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { codeCoachApi } from '../services/codeCoachApi';
import { useAuth } from '../context/AuthContext';
import { formatApiError, mapStruggleLevelToBadge } from '../config';
import { Activity, Target, BrainCircuit, PlayCircle, Flame, Award, AlertTriangle } from 'lucide-react';

function mergeRecommendationWithStruggle(recommendation, struggles) {
    const struggle = struggles.find((item) => item.concept_tag === recommendation.concept_tag) || null;

    return {
        recommendationId: recommendation.recommendation_id,
        conceptTag: recommendation.concept_tag,
        errorType: recommendation.error_type,
        gameType: recommendation.game_type,
        gameId: recommendation.game_id,
        title: recommendation.title,
        difficultyLevel: recommendation.difficulty_level,
        supportLevel: recommendation.support_level,
        rationale: recommendation.rationale,
        priority: recommendation.priority,
        adaptationGoal: recommendation.adaptation_goal,
        basedOnStruggleLevel: recommendation.based_on_struggle_level || struggle?.struggle_level,
        basedOnMasteryLevel: recommendation.based_on_mastery_level,
        struggleScore: struggle?.struggle_score ?? null,
        struggleLevel: struggle?.struggle_level || recommendation.based_on_struggle_level || 'moderate',
        repeatCount: struggle?.repeat_count ?? 0,
        activeCount: struggle?.active_count ?? 0,
        hintDependencyLevel: struggle?.hint_dependency_level ?? null,
        recommendedAction: struggle?.recommended_action || recommendation.adaptation_goal,
        focusPoints: recommendation.focus_points || []
    };
}

const Dashboard = () => {
    const [recommendation, setRecommendation] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { user, userId } = useAuth();

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const fetchDashboardData = async () => {
            setLoadError('');

            try {
                const [recommendationsRes, strugglesRes, profileRes] = await Promise.all([
                    codeCoachApi.getRecommendations(5),
                    codeCoachApi.getStrugglingConcepts(10),
                    apiService.getProfile(userId).catch(() => ({ data: { totalScore: 0, currentStreak: 0, badges: [] } }))
                ]);

                setProfile(profileRes.data);

                const recommendations = recommendationsRes.recommendations || [];
                const struggles = strugglesRes.struggles || [];

                if (recommendations.length > 0) {
                    setRecommendation(mergeRecommendationWithStruggle(recommendations[0], struggles));
                } else {
                    setRecommendation(null);
                }
            } catch (err) {
                console.error('Failed to load dashboard:', err);
                setLoadError(formatApiError(err));
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [userId]);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', marginTop: '100px' }}>
                <Activity size={48} color="#60a5fa" style={{ animation: 'spin 2s linear infinite' }} />
                <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
                    Loading real Code Coach struggle signals for {user?.fullName || user?.email}...
                </p>
            </div>
        );
    }

    const struggleBadge = mapStruggleLevelToBadge(recommendation?.struggleLevel);

    return (
        <div>
            {profile && (
                <div className="glass-panel profile-banner" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Welcome back, {user?.fullName || 'Coder'}!</h2>
                        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                            Signed in as {user?.email}
                        </p>
                        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Total XP: {profile.totalScore || 0}</p>
                    </div>

                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: 'bold', fontSize: '1.25rem' }}>
                                <Flame size={24} fill={profile.currentStreak > 0 ? '#ef4444' : 'none'} />
                                {profile.currentStreak || 0}
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Day Streak</span>
                        </div>

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

            <h2>Personalized Learning Dashboard</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                Live recommendations from Code Coach based on your real diagnostic history in MongoDB Atlas.
            </p>

            {loadError && (
                <div className="auth-error" style={{ marginBottom: '24px' }}>
                    <AlertTriangle size={18} />
                    <span>{loadError}. Make sure Code Coach backend is running on port 8000.</span>
                </div>
            )}

            {recommendation ? (
                <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', padding: '32px', border: '2px solid rgba(96, 165, 250, 0.4)', background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(241, 245, 249, 0.85) 100%)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Target color="#f59e0b" size={28} />
                            <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{recommendation.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span className={`badge badge-${struggleBadge}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                                {recommendation.struggleLevel} Frustration
                            </span>
                            <span className={`badge badge-${recommendation.difficultyLevel?.toLowerCase() || 'medium'}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                                {recommendation.difficultyLevel} Difficulty
                            </span>
                        </div>
                    </div>

                    <div className="struggle-metrics" style={{ marginBottom: '20px' }}>
                        <div className="struggle-metric">
                            <span>Struggle Score</span>
                            <strong>{recommendation.struggleScore ?? '—'}</strong>
                        </div>
                        <div className="struggle-metric">
                            <span>Active Errors</span>
                            <strong>{recommendation.activeCount}</strong>
                        </div>
                        <div className="struggle-metric">
                            <span>Repeat Count</span>
                            <strong>{recommendation.repeatCount}</strong>
                        </div>
                        <div className="struggle-metric">
                            <span>Hint Dependency</span>
                            <strong>{recommendation.hintDependencyLevel || 'low'}</strong>
                        </div>
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: '16px' }}>
                        <BrainCircuit size={18} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#3b82f6' }} />
                        Concept: <strong>{recommendation.conceptTag.replace(/_/g, ' ')}</strong>
                        {recommendation.errorType ? <> · Error: <strong>{recommendation.errorType}</strong></> : null}
                    </p>

                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.08)', marginBottom: '16px', borderLeft: '4px solid #3b82f6' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Assigned Game Type:</span>
                        <h4 style={{ margin: '4px 0 0 0', color: '#1e40af', fontSize: '1.1rem' }}>{recommendation.gameType}</h4>
                        <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{recommendation.rationale}</p>
                    </div>

                    {recommendation.focusPoints.length > 0 && (
                        <ul style={{ margin: '0 0 24px 18px', color: 'var(--text-secondary)' }}>
                            {recommendation.focusPoints.map((point) => (
                                <li key={point}>{point}</li>
                            ))}
                        </ul>
                    )}

                    <button
                        className="btn"
                        style={{ width: '100%', padding: '14px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                        onClick={() => navigate(
                            `/play/${recommendation.gameType}/${recommendation.conceptTag}/${recommendation.difficultyLevel}`,
                            { state: { recommendation } }
                        )}
                    >
                        <PlayCircle size={22} />
                        Start {recommendation.gameType} Practice
                    </button>
                </div>
            ) : (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
                    <h3>No practice recommendation yet</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Code Coach has not detected enough struggle signals for <strong>{user?.email}</strong> yet.
                    </p>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Write Java code in VS Code with Code Coach enabled, then sign in here again to receive a personalized game.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
