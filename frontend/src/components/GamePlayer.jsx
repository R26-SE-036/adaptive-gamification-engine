import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { codeCoachApi } from '../services/codeCoachApi';
import { formatGameType, getRuntimeLearningSessionId } from '../config';
import { useAuth } from '../context/AuthContext';
import { Lightbulb, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const initialState = {
    currentQuestion: null,
    selectedAnswer: null,
    hintLevel: 0,
    attemptCount: 1,
    timerSeconds: 0,
    gamePhase: 'loading',
    error: null
};

function gameReducer(state, action) {
    switch (action.type) {
        case 'INIT': {
            let initialAnswer = null;
            if (action.payload.gameType === 'DragDrop') {
                initialAnswer = action.payload.codeLines.map((_, i) => i);
            } else if (action.payload.gameType === 'CodeTrace') {
                initialAnswer = '';
            }
            return { ...state, currentQuestion: action.payload, selectedAnswer: initialAnswer, gamePhase: 'playing', error: null };
        }
        case 'SELECT_ANSWER':
            return { ...state, selectedAnswer: action.payload };
        case 'USE_HINT':
            return { ...state, hintLevel: Math.min(state.hintLevel + 1, 3) };
        case 'ADD_ATTEMPT':
            return { ...state, attemptCount: state.attemptCount + 1 };
        case 'TICK':
            return { ...state, timerSeconds: state.timerSeconds + 1 };
        case 'SUBMIT':
            return { ...state, gamePhase: 'submitted' };
        case 'ERROR':
            return { ...state, error: action.payload, gamePhase: 'playing' };
        default:
            return state;
    }
}

const GamePlayer = () => {
    const { gameType, conceptTag, difficulty } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const recommendation = location.state?.recommendation;
    const { userId } = useAuth();
    const learningSessionId = getRuntimeLearningSessionId();
    const [state, dispatch] = useReducer(gameReducer, initialState);
    const [submitResult, setSubmitResult] = useState(null);

    // The URL carries whatever Code Coach recommended, in ITS vocabulary
    // (loop_tracer, condition_debug, bug_hunt). This engine implements three
    // games - BugHunt, DragDrop, CodeTrace - and the question bank is keyed by
    // those. The server resolves the two and returns a real question, so the
    // question's own gameType is the one to render and grade against. Rendering
    // from the URL param instead meant no instructions appeared and the wrong
    // interaction was shown.
    const activeGameType = state.currentQuestion?.gameType || gameType;

    // Same reasoning for difficulty: the URL says 'beginner' (Code Coach's
    // wording), the question served says 'Easy' (this engine's). Reporting the
    // URL value recorded a difficulty the student never actually played, which
    // then fed Code Coach's mastery model.
    const activeDifficulty = state.currentQuestion?.difficulty || difficulty;
    const adaptationRecorded = useRef(false);

    const dragItem = React.useRef();
    const dragOverItem = React.useRef();

    const dragStart = (e, position) => {
        dragItem.current = position;
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const drop = () => {
        const copyListItems = [...state.selectedAnswer];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        dispatch({ type: 'SELECT_ANSWER', payload: copyListItems });
    };

    useEffect(() => {
        if (!userId) {
            dispatch({ type: 'ERROR', payload: 'Authentication required' });
            return;
        }

        let isMounted = true;

        apiService.getGame(userId, gameType, conceptTag, difficulty)
            .then(async (res) => {
                if (!isMounted) return;

                dispatch({ type: 'INIT', payload: res.data });

                if (recommendation && learningSessionId && !adaptationRecorded.current) {
                    adaptationRecorded.current = true;
                    try {
                        await codeCoachApi.recordAdaptationDecision({
                            learningSessionId,
                            concept_tag: recommendation.conceptTag,
                            recommendation_id: recommendation.recommendationId,
                            game_id: recommendation.gameId || res.data.id,
                            game_type: recommendation.gameType || gameType,
                            difficulty_level: activeDifficulty,
                            support_level: recommendation.supportLevel || 'guided',
                            rationale: recommendation.rationale || `Assigned ${gameType} for ${conceptTag}`,
                            based_on_mastery_level: recommendation.basedOnMasteryLevel,
                            based_on_struggle_level: recommendation.struggleLevel || recommendation.basedOnStruggleLevel
                        });
                    } catch (err) {
                        console.warn('Could not record adaptation decision:', err);
                    }
                }
            })
            .catch(() => {
                if (isMounted) {
                    dispatch({ type: 'ERROR', payload: 'We could not load your practice activity. Please try again.' });
                }
            });

        return () => { isMounted = false; };
    }, [userId, gameType, conceptTag, difficulty, recommendation, learningSessionId]);

    useEffect(() => {
        if (state.gamePhase !== 'playing') return;
        const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
        return () => clearInterval(timer);
    }, [state.gamePhase]);

    const handleSubmit = async () => {
        if (state.selectedAnswer === null) return;

        try {
            const payload = {
                userId,
                learningSessionId,
                gameType: activeGameType,
                conceptTag,
                questionId: state.currentQuestion.id,
                selectedAnswer: state.selectedAnswer,
                hintUsage: state.hintLevel,
                timeTakenSeconds: state.timerSeconds,
                attemptCount: state.attemptCount
            };

            const res = await apiService.submitGame(payload);
            setSubmitResult(res.data);
            dispatch({ type: 'SUBMIT' });

            if (learningSessionId) {
                try {
                    await codeCoachApi.recordSessionResult({
                        learningSessionId,
                        concept_tag: conceptTag,
                        recommendation_id: recommendation?.recommendationId,
                        game_id: recommendation?.gameId || state.currentQuestion.id,
                        game_type: activeGameType,
                        difficulty_level: activeDifficulty,
                        support_level: recommendation?.supportLevel || 'guided',
                        score_percent: res.data.score,
                        error_count: res.data.score > 0 ? 0 : 1,
                        attempt_count: state.attemptCount,
                        hint_usage: state.hintLevel,
                        time_taken_seconds: state.timerSeconds,
                        passed: res.data.score >= 80
                    });
                } catch (err) {
                    console.warn('Could not record session result in Code Coach:', err);
                }
            }

            setTimeout(() => {
                navigate('/results', {
                    state: {
                        result: res.data,
                        conceptTag,
                        attemptCount: state.attemptCount,
                        hintLevel: state.hintLevel,
                        time: state.timerSeconds
                    }
                });
            }, 3000);
        } catch {
            dispatch({ type: 'ERROR', payload: 'We could not save this attempt. Please try once more.' });
        }
    };

    if (state.gamePhase === 'loading') return <div>Loading your targeted practice...</div>;

    const q = state.currentQuestion;

    if (state.error && !q) {
        return (
            <div className="glass-panel" style={{ maxWidth: '720px', margin: '80px auto', textAlign: 'center', padding: '32px' }}>
                <AlertCircle size={40} style={{ color: 'var(--cg-danger)', marginBottom: '12px' }} />
                <h3 style={{ marginTop: 0 }}>{state.error}</h3>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>{formatGameType(activeGameType)} <span className="badge badge-medium">{difficulty}</span></h2>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={18} /> {state.timerSeconds}s
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px' }}>
                <h3 style={{ borderBottom: '1px solid var(--cg-border)', paddingBottom: '12px' }}>
                    {activeGameType === 'BugHunt' && 'Find the learning issue in this code snippet:'}
                    {activeGameType === 'DragDrop' && 'Drag and drop the code blocks into a clear logical order:'}
                    {activeGameType === 'CodeTrace' && 'Trace the code and determine the final output:'}
                </h3>

                <div className="code-block" style={{ marginTop: '16px' }}>
                    {activeGameType === 'BugHunt' && q?.codeLines.map((line, idx) => (
                        <div
                            key={idx}
                            className={`code-line interactive ${state.selectedAnswer === idx ? 'selected' : ''}`}
                            onClick={() => dispatch({ type: 'SELECT_ANSWER', payload: idx })}
                        >
                            <span style={{ opacity: 0.5, marginRight: '16px', userSelect: 'none' }}>{idx + 1}</span>
                            {line}
                        </div>
                    ))}

                    {activeGameType === 'DragDrop' && state.selectedAnswer && Array.isArray(state.selectedAnswer) && state.selectedAnswer.map((originalIndex, index) => (
                        <div
                            key={index}
                            draggable
                            onDragStart={(e) => dragStart(e, index)}
                            onDragEnter={(e) => dragEnter(e, index)}
                            onDragEnd={drop}
                            onDragOver={(e) => e.preventDefault()}
                            className="code-line interactive draggable"
                            style={{ cursor: 'grab' }}
                        >
                            <span style={{ opacity: 0.5, marginRight: '16px', userSelect: 'none' }}>::</span>
                            {q.codeLines[originalIndex]}
                        </div>
                    ))}

                    {activeGameType === 'CodeTrace' && (
                        <>
                            {q?.codeLines.map((line, idx) => (
                                <div key={idx} className="code-line">
                                    <span style={{ opacity: 0.5, marginRight: '16px', userSelect: 'none' }}>{idx + 1}</span>
                                    {line}
                                </div>
                            ))}
                            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold' }}>Final Output:</span>
                                <input
                                    type="text"
                                    className="trace-input"
                                    value={state.selectedAnswer || ''}
                                    onChange={(e) => dispatch({ type: 'SELECT_ANSWER', payload: e.target.value })}
                                    placeholder="Enter expected value..."
                                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'var(--cg-card)', color: 'var(--cg-ink)', fontSize: '1rem', flex: 1 }}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {state.hintLevel > 0 && (
                <div className="hint-box">
                    <Lightbulb size={20} style={{ position: 'absolute', marginLeft: '-32px' }} />
                    <p><strong>Hint {state.hintLevel}:</strong> {q.hints[state.hintLevel - 1]}</p>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => dispatch({ type: 'USE_HINT' })}
                    disabled={state.hintLevel >= 3 || state.gamePhase !== 'playing'}
                >
                    <Lightbulb size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    Use Hint (-15 points)
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ padding: '10px', color: 'var(--text-secondary)' }}>Attempt {state.attemptCount}</span>
                    <button
                        className="btn"
                        onClick={handleSubmit}
                        disabled={state.selectedAnswer === null || state.gamePhase !== 'playing'}
                    >
                        Submit Attempt
                    </button>
                </div>
            </div>

            {submitResult && (
                <div className={`glass-panel ${submitResult.score > 0 ? '' : 'failed'}`} style={{ marginTop: '24px', backgroundColor: submitResult.score > 0 ? 'var(--cg-ok-soft)' : 'var(--cg-warn-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: submitResult.score > 0 ? 'var(--success-color)' : 'var(--cg-warn)' }}>
                        {submitResult.score > 0 ? <CheckCircle2 /> : <AlertCircle />}
                        <h3>{submitResult.score > 0 ? `Nice progress! You earned ${submitResult.score} points` : 'Attempt recorded. Let us practice this concept once more.'}</h3>
                    </div>
                    <p style={{ marginTop: '8px' }}>{submitResult.learnerFeedback || submitResult.explanation}</p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Navigating to results...</p>
                </div>
            )}
        </div>
    );
};

export default GamePlayer;
