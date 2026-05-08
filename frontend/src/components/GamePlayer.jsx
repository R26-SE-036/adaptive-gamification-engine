import React, { useEffect, useReducer, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { CONFIG } from '../config';
import { Lightbulb, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const initialState = {
    currentQuestion: null,
    selectedAnswer: null,
    hintLevel: 0,
    attemptCount: 1,
    timerSeconds: 0,
    gamePhase: 'loading', // loading, playing, submitted
    error: null
};

function gameReducer(state, action) {
    switch(action.type) {
        case 'INIT': return { ...state, currentQuestion: action.payload, gamePhase: 'playing', error: null };
        case 'SELECT_ANSWER': return { ...state, selectedAnswer: action.payload };
        case 'USE_HINT': return { ...state, hintLevel: Math.min(state.hintLevel + 1, 3) };
        case 'ADD_ATTEMPT': return { ...state, attemptCount: state.attemptCount + 1 };
        case 'TICK': return { ...state, timerSeconds: state.timerSeconds + 1 };
        case 'SUBMIT': return { ...state, gamePhase: 'submitted' };
        case 'ERROR': return { ...state, error: action.payload, gamePhase: 'playing' };
        default: return state;
    }
}

const GamePlayer = () => {
    const { gameType, conceptTag, difficulty } = useParams();
    const navigate = useNavigate();
    const [state, dispatch] = useReducer(gameReducer, initialState);
    const [submitResult, setSubmitResult] = useState(null);

    useEffect(() => {
        let isMounted = true;
        apiService.getGame(CONFIG.MOCK_USER_ID, gameType, conceptTag, difficulty)
            .then(res => {
                if(isMounted) dispatch({ type: 'INIT', payload: res.data });
            })
            .catch(err => {
                if(isMounted) dispatch({ type: 'ERROR', payload: "Failed to load game" });
            });
        return () => { isMounted = false; };
    }, [gameType, conceptTag, difficulty]);

    useEffect(() => {
        if(state.gamePhase !== 'playing') return;
        const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
        return () => clearInterval(timer);
    }, [state.gamePhase]);

    const handleSubmit = async () => {
        if (state.selectedAnswer === null) return;
        
        try {
            const payload = {
                userId: CONFIG.MOCK_USER_ID,
                learningSessionId: CONFIG.MOCK_LEARNING_SESSION_ID,
                gameType,
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

            // Automatically navigate to results after short delay
            setTimeout(() => {
                navigate('/results', { state: { result: res.data, conceptTag, attemptCount: state.attemptCount, hintLevel: state.hintLevel, time: state.timerSeconds } });
            }, 3000);

        } catch (err) {
            dispatch({ type: 'ERROR', payload: "Submission failed" });
        }
    };

    if (state.gamePhase === 'loading') return <div>Loading your targeted practice...</div>;
    
    const q = state.currentQuestion;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2>{gameType} <span className="badge badge-medium">{difficulty}</span></h2>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={18} /> {state.timerSeconds}s
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px' }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
                    Find the bug in this code snippet:
                </h3>
                
                <div className="code-block" style={{ marginTop: '16px' }}>
                    {q?.codeLines.map((line, idx) => (
                        <div 
                            key={idx} 
                            className={`code-line interactive ${state.selectedAnswer === idx ? 'selected' : ''}`}
                            onClick={() => dispatch({ type: 'SELECT_ANSWER', payload: idx })}
                        >
                            <span style={{ opacity: 0.5, marginRight: '16px', userSelect: 'none' }}>{idx + 1}</span>
                            {line}
                        </div>
                    ))}
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
                    <Lightbulb size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }}/>
                    Use Hint (-15 pts)
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ padding: '10px', color: 'var(--text-secondary)' }}>Attempt {state.attemptCount}</span>
                    <button 
                        className="btn" 
                        onClick={handleSubmit}
                        disabled={state.selectedAnswer === null || state.gamePhase !== 'playing'}
                    >
                        Submit Answer
                    </button>
                </div>
            </div>

            {submitResult && (
                <div className={`glass-panel ${submitResult.score > 0 ? '' : 'failed'}`} style={{ marginTop: '24px', backgroundColor: submitResult.score > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: submitResult.score > 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        {submitResult.score > 0 ? <CheckCircle2 /> : <AlertCircle />}
                        <h3>{submitResult.score > 0 ? `Correct! You scored ${submitResult.score} pts` : `Incorrect. Score: 0`}</h3>
                    </div>
                    <p style={{ marginTop: '8px' }}>{submitResult.explanation}</p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Navigating to results...</p>
                </div>
            )}
        </div>
    );
};

export default GamePlayer;
