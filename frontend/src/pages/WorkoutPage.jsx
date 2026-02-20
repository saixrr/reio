import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePose } from '../hooks/usePose';
import { useRepCounter } from '../hooks/useRepCounter';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import api from '../api/axios';
import Navbar from '../components/Navbar';

// ── Today's plan (can be extended to come from backend/profile) ──
const WORKOUT_EXERCISES = [
    { id: 'squat', label: 'Squats', icon: '🦵', hint: 'Track knee angle, back alignment' },
    { id: 'pushup', label: 'Push-ups', icon: '💪', hint: 'Track elbow angle, body alignment' },
    { id: 'lunge', label: 'Lunges', icon: '🏃', hint: 'Track front knee angle, step position' },
];

const getTodaysPlan = () => {
    // Rotate through exercises based on day of week so the plan feels dynamic
    const dayIdx = new Date().getDay(); // 0=Sun … 6=Sat
    const plans = [
        ['squat', 'pushup'],
        ['lunge', 'squat'],
        ['pushup', 'lunge'],
        ['squat', 'pushup', 'lunge'],
        ['lunge', 'pushup'],
        ['squat', 'lunge'],
        ['pushup', 'squat'],
    ];
    return plans[dayIdx];
};

export default function WorkoutPage() {
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const lastDescRef = useRef(null); // stores latest pose descriptor from usePose

    const [exerciseType, setExerciseType] = useState(null); // null = not yet chosen
    const [isActive, setIsActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [sessionStartTime, setSessionStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [sessionDone, setSessionDone] = useState(false);
    const [sessionResult, setSessionResult] = useState(null);

    // ── Person Lock State ────────────────────────────────────────
    const [personLocked, setPersonLocked] = useState(false);
    const [lockTarget, setLockTarget] = useState(null);
    const [isPersonLost, setIsPersonLost] = useState(false);

    const todaysPlan = getTodaysPlan();

    const { reps, accuracy, feedback, phase, processLandmarks, reset } = useRepCounter(exerciseType || 'squat');
    const { speak } = useVoiceAssistant();

    // Voice triggers
    useEffect(() => { if (reps > 0) speak(reps.toString(), true); }, [reps, speak]);
    useEffect(() => {
        if (feedback?.includes('⚠')) speak(feedback.replace('⚠', ''), false);
    }, [feedback, speak]);

    // Elapsed timer
    useEffect(() => {
        let iv;
        if (isActive && sessionStartTime) {
            iv = setInterval(() => setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000)), 1000);
        }
        return () => clearInterval(iv);
    }, [isActive, sessionStartTime]);

    // ── Pose result handler ──────────────────────────────────────
    const handlePoseResults = useCallback(
        (results, isLost) => {
            setIsPersonLost(!!isLost);
            if (results?.poseLandmarks && !isLost) {
                processLandmarks(results.poseLandmarks);
            }
        },
        [processLandmarks]
    );

    // Capture latest descriptor (unlocked mode, each frame)
    const handleLockData = useCallback((desc) => {
        lastDescRef.current = desc;
    }, []);

    // Hook into MediaPipe
    usePose(videoRef, canvasRef, handlePoseResults, isActive, personLocked, handleLockData, lockTarget);

    // ── Camera controls ──────────────────────────────────────────
    const startCamera = async () => {
        if (!exerciseType) return alert('⚠️ Please select a workout before starting!');
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setIsActive(true);
            setSessionStartTime(Date.now());
            speak(`Starting ${exerciseType} session. Good luck!`, true);
        } catch (err) {
            setCameraError(
                err.name === 'NotAllowedError'
                    ? '🚫 Camera permission denied. Allow camera access in browser settings.'
                    : `❌ Camera error: ${err.message}`
            );
        }
    };

    const stopCamera = () => {
        setIsActive(false);
        setPersonLocked(false);
        setLockTarget(null);
        if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
    };

    // ── Person Lock / Unlock ─────────────────────────────────────
    const handleLockPerson = () => {
        if (lastDescRef.current) {
            setLockTarget(lastDescRef.current);
            setPersonLocked(true);
            speak('Person locked. Tracking you only.', true);
        }
    };

    const handleUnlockPerson = () => {
        setPersonLocked(false);
        setLockTarget(null);
        setIsPersonLost(false);
        speak('Tracking unlocked.', true);
    };

    // ── Session end ──────────────────────────────────────────────
    const generateSummary = (acc, r) => {
        const label = WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label || exerciseType;
        if (acc >= 90) return `Excellent ${label} form! ${r} perfect reps.`;
        if (acc >= 75) return `Good work! ${r} ${label}s with solid form.`;
        return `${r} ${label}s completed. Keep practicing your form!`;
    };

    const handleEndSession = async () => {
        stopCamera();
        setSubmitting(true);
        speak('Session complete. Great work today!', true);
        try {
            const payload = {
                exerciseType,
                repsCompleted: reps,
                accuracyScore: accuracy,
                duration: elapsedTime,
                feedbackSummary: generateSummary(accuracy, reps),
            };
            const { data } = await api.post('/session/complete', payload);
            setSessionResult({ ...payload, improvement: data.data.improvementPercentage, streak: data.data.currentStreak });
            setSessionDone(true);
        } catch {
            setSessionDone(true);
            setSessionResult({ exerciseType, repsCompleted: reps, accuracyScore: accuracy, duration: elapsedTime, improvement: 0, streak: 0 });
        } finally { setSubmitting(false); }
    };

    const formatTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const getPhaseColor = () => phase === 'DOWN' ? '#ff4d6d' : phase === 'UP' ? '#00f5ff' : '#94a3b8';

    // ── Session Complete ─────────────────────────────────────────
    if (sessionDone && sessionResult) {
        return (
            <div className="page-shell">
                <Navbar />
                <main className="session-result">
                    <div className="result-card">
                        <div className="result-icon">🎉</div>
                        <h1>{WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label || exerciseType} Complete!</h1>
                        <p className="result-summary">{generateSummary(sessionResult.accuracyScore, sessionResult.repsCompleted)}</p>
                        <div className="result-stats">
                            <div className="result-stat"><span className="rs-value">{sessionResult.repsCompleted}</span><span className="rs-label">Reps</span></div>
                            <div className="result-stat"><span className="rs-value">{sessionResult.accuracyScore}%</span><span className="rs-label">Accuracy</span></div>
                            <div className="result-stat"><span className="rs-value">{formatTime(sessionResult.duration)}</span><span className="rs-label">Duration</span></div>
                            <div className="result-stat">
                                <span className="rs-value" style={{ color: sessionResult.improvement >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {sessionResult.improvement >= 0 ? '+' : ''}{sessionResult.improvement}%
                                </span>
                                <span className="rs-label">Improvement</span>
                            </div>
                            <div className="result-stat"><span className="rs-value">🔥 {sessionResult.streak}</span><span className="rs-label">Day Streak</span></div>
                        </div>
                        <div className="result-actions">
                            <button className="btn btn-primary" onClick={() => { reset(); setSessionDone(false); setElapsedTime(0); setExerciseType(null); }}>
                                🔄 New Session
                            </button>
                            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>📊 Dashboard</button>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // ── Main UI ──────────────────────────────────────────────────
    return (
        <div className="page-shell">
            <Navbar />
            <main className="workout-page">

                {/* ─── TODAY'S PLAN BANNER ────────────────────────── */}
                <div className="plan-banner">
                    <span className="plan-title">📋 Today's Plan:</span>
                    {WORKOUT_EXERCISES.filter(e => todaysPlan.includes(e.id)).map(ex => (
                        <button
                            key={ex.id}
                            className={`plan-pill ${exerciseType === ex.id ? 'plan-active' : ''} ${isActive ? 'plan-disabled' : ''}`}
                            onClick={() => !isActive && setExerciseType(ex.id)}
                        >
                            {ex.icon} {ex.label}
                            {exerciseType === ex.id && <span className="plan-sel-dot">●</span>}
                        </button>
                    ))}
                    {exerciseType && <span className="plan-selected-label">Selected: <strong>{WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label}</strong></span>}
                </div>

                {/* ─── WORKOUT HEADER ──────────────────────────────── */}
                <div className="workout-header">
                    <div className="header-left">
                        <h1>🏋️ {exerciseType
                            ? `Tracking: ${WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label}`
                            : 'Select a Workout'}</h1>
                        {isActive && <span className="live-badge">● LIVE</span>}
                        {isActive && personLocked && (
                            <span className={`lock-badge ${isPersonLost ? 'lock-lost' : 'lock-ok'}`}>
                                {isPersonLost ? '🟡 Tracking — Person Lost' : '🔒 Person Locked'}
                            </span>
                        )}
                    </div>

                    {/* Exercise selector (only when not active) */}
                    {!isActive && (
                        <div className="exercise-selector">
                            {WORKOUT_EXERCISES.map(ex => (
                                <button
                                    key={ex.id}
                                    className={`selector-btn ${exerciseType === ex.id ? 'active' : ''}`}
                                    onClick={() => setExerciseType(ex.id)}
                                    title={ex.hint}
                                >
                                    {ex.icon} {ex.label}
                                    {todaysPlan.includes(ex.id) && <span className="plan-dot" title="In today's plan" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="workout-layout">
                    {/* ─── CAMERA AREA ─────────────────────────────── */}
                    <div className="camera-container">
                        {!isActive && !cameraError && (
                            <div className="camera-placeholder">
                                <div className="camera-icon">📷</div>
                                <p>{exerciseType
                                    ? `Ready to track your ${WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label}?`
                                    : 'Select a workout above to get started'}</p>
                                <p className="camera-hint">Ensure your full body is visible in the frame</p>
                            </div>
                        )}
                        {cameraError && <div className="camera-error"><p>{cameraError}</p></div>}

                        <video
                            ref={videoRef}
                            className="workout-video"
                            playsInline muted
                            style={{ display: isActive ? 'block' : 'none', transform: 'scaleX(-1)' }}
                        />
                        <canvas
                            ref={canvasRef}
                            className="pose-canvas"
                            style={{ display: isActive ? 'block' : 'none', transform: 'scaleX(-1)' }}
                        />

                        {/* ─── CAMERA + LOCK CONTROLS ─────────────── */}
                        <div className="camera-controls">
                            {!isActive ? (
                                <button className="btn btn-primary btn-lg" onClick={startCamera}>
                                    🎥 Start Workout
                                </button>
                            ) : (
                                <div className="active-controls">
                                    {/* Person Lock / Unlock */}
                                    {!personLocked ? (
                                        <button className="btn btn-lock" onClick={handleLockPerson} title="Lock tracking to the currently detected person">
                                            🔒 Lock Person
                                        </button>
                                    ) : (
                                        <button className="btn btn-unlock" onClick={handleUnlockPerson} title="Return to normal multi-person detection">
                                            🔓 Unlock
                                        </button>
                                    )}

                                    {/* End session */}
                                    <button className="btn btn-danger btn-lg" onClick={handleEndSession} disabled={submitting}>
                                        {submitting ? <span className="spinner" /> : '⏹ End Session'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── FEEDBACK PANEL ──────────────────────────── */}
                    <div className="feedback-panel">
                        <div className="panel-card timer-card">
                            <div className="timer-display">{formatTime(elapsedTime)}</div>
                            <div className="timer-label">Session Time</div>
                        </div>

                        {isActive && (
                            <div className="panel-card phase-card" style={{ borderColor: getPhaseColor() }}>
                                <div className="phase-indicator" style={{ color: getPhaseColor() }}>
                                    {phase === 'DOWN' ? '⬇ DOWN' : phase === 'UP' ? '⬆ UP' : '⏸ READY'}
                                </div>
                            </div>
                        )}

                        <div className="panel-card reps-card">
                            <div className="big-number">{reps}</div>
                            <div className="panel-label">REPS</div>
                        </div>

                        <div className="panel-card accuracy-card">
                            <div className="big-number" style={{ color: accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444' }}>
                                {accuracy}%
                            </div>
                            <div className="panel-label">ACCURACY</div>
                            <div className="accuracy-bar">
                                <div className="accuracy-fill" style={{
                                    width: `${accuracy}%`,
                                    background: accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444',
                                }} />
                            </div>
                        </div>

                        <div className="panel-card feedback-card">
                            <div className="feedback-message">{feedback}</div>
                            <div className="panel-label">ASSISTANT FEEDBACK</div>
                        </div>

                        {/* Exercise hint panel (when not active) */}
                        {!isActive && exerciseType && (
                            <div className="panel-card instructions-card">
                                <h4>{WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.icon} {WORKOUT_EXERCISES.find(e => e.id === exerciseType)?.label} Tips</h4>
                                <p>{exerciseType === 'squat' && 'Keep back straight, lower until thighs are parallel to floor.'}</p>
                                <p>{exerciseType === 'pushup' && 'Keep body in plank line, lower chest to floor, elbows at 45°.'}</p>
                                <p>{exerciseType === 'lunge' && 'Step forward, front knee over ankle, back knee near floor.'}</p>
                                <p className="voice-hint">🔊 Voice assistant will count reps and guide your form.</p>
                            </div>
                        )}

                        {!isActive && !exerciseType && (
                            <div className="panel-card instructions-card">
                                <h4>Voice Assistant Active 🔊</h4>
                                <p>Select a workout above, then press Start. The assistant will count reps and correct form in real-time.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Additional inline styles for new elements */}
                <style>{`
                    .plan-banner { display:flex; align-items:center; gap:10px; padding:14px 32px; background:rgba(0,245,255,0.04); border-bottom:1px solid rgba(255,255,255,0.06); flex-wrap:wrap; }
                    .plan-title  { font-size:13px; color:#888; font-weight:700; text-transform:uppercase; letter-spacing:1px; white-space:nowrap; }
                    .plan-pill   { padding:6px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); color:#ccc; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:6px; transition:all 0.2s; }
                    .plan-pill:hover:not(.plan-disabled) { border-color:rgba(0,245,255,0.4); color:#00f5ff; }
                    .plan-active { border-color:#00f5d4 !important; background:rgba(0,245,212,0.1) !important; color:#00f5d4 !important; font-weight:700; }
                    .plan-disabled { opacity:0.5; cursor:not-allowed; }
                    .plan-sel-dot { width:6px; height:6px; background:#00f5d4; border-radius:50%; }
                    .plan-selected-label { margin-left:auto; font-size:13px; color:#888; }

                    .plan-dot { display:inline-block; width:6px; height:6px; background:#00f5d4; border-radius:50%; margin-left:5px; vertical-align:middle; }

                    .lock-badge { font-size:12px; padding:3px 10px; border-radius:10px; margin-left:12px; font-weight:700; }
                    .lock-ok   { background:rgba(0,245,212,0.15); color:#00f5d4; border:1px solid #00f5d4; }
                    .lock-lost { background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b; animation: pulse 1s ease infinite; }
                    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

                    .active-controls { display:flex; gap:10px; align-items:center; }
                    .btn-lock   { padding:10px 18px; background:rgba(0,245,212,0.15); border:1px solid #00f5d4; color:#00f5d4; border-radius:10px; cursor:pointer; font-weight:700; font-size:13px; transition:all 0.2s; }
                    .btn-lock:hover { background:rgba(0,245,212,0.25); }
                    .btn-unlock { padding:10px 18px; background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#f87171; border-radius:10px; cursor:pointer; font-weight:700; font-size:13px; }

                    .voice-hint { font-size:11px; color:#888; margin-top:10px; }
                `}</style>
            </main>
        </div>
    );
}
