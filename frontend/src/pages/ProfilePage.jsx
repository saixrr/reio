import { useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import api from '../api/axios';

export default function ProfilePage() {
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));
    const [stats, setStats] = useState({ consistencyStreak: 0, averageAccuracy: 0, totalWorkoutsCompleted: 0 });
    const [sessions, setSessions] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({ ...user });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [meRes, summaryRes, chartsRes] = await Promise.all([
                api.get('/auth/me'),
                api.get('/progress/summary'),
                api.get('/progress/charts?limit=365')
            ]);
            setUser(meRes.data.data);
            setForm(meRes.data.data);
            setStats(summaryRes.data.data);
            setSessions(chartsRes.data.data.dates || []);
            localStorage.setItem('user', JSON.stringify(meRes.data.data));
        } catch (err) {
            console.error('Failed to fetch profile data', err);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data } = await api.put('/auth/profile', form);
            setUser(data.data);
            localStorage.setItem('user', JSON.stringify(data.data));
            setIsEditing(false);
            setMessage('Profile updated successfully! ✅');
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            console.error('Update failed', err);
            setMessage('Failed to update profile. ❌');
        } finally {
            setLoading(false);
        }
    };

    const bmi = useMemo(() => {
        if (!user.height || !user.weight) return null;
        const h = user.height / 100;
        const val = (user.weight / (h * h)).toFixed(1);
        let cat = 'Normal';
        let color = 'var(--accent-cyan)';
        if (val < 18.5) { cat = 'Underweight'; color = 'var(--accent-gold)'; }
        else if (val >= 25 && val < 30) { cat = 'Overweight'; color = 'var(--accent-pink)'; }
        else if (val >= 30) { cat = 'Obese'; color = 'var(--accent-red)'; }
        return { val, cat, color };
    }, [user]);

    // Heatmap Logic: Last 12 weeks
    const heatmapData = useMemo(() => {
        const weeks = [];
        const today = new Date();
        for (let i = 11; i >= 0; i--) {
            const week = [];
            for (let j = 0; j < 7; j++) {
                const d = new Date(today);
                d.setDate(today.getDate() - (i * 7 + (6 - j)));
                const dStr = d.toISOString().split('T')[0];
                const count = sessions.filter(s => s === dStr).length;
                week.push({ date: dStr, count });
            }
            weeks.push(week);
        }
        return weeks;
    }, [sessions]);

    return (
        <div className="page-shell">
            <Navbar />
            <main className="profile-container">
                {message && <div className="notice-pill">{message}</div>}

                {/* SECTION 1: OVERVIEW */}
                <header className="profile-header glass">
                    <div className="user-meta">
                        <div className="user-avatar">👤</div>
                        <div>
                            <h1>{user.name}</h1>
                            <p>{user.email} • {user.fitnessLevel?.toUpperCase() || 'BEGINNER'}</p>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => setIsEditing(!isEditing)}>
                        {isEditing ? 'Cancel' : 'Edit Profile'}
                    </button>
                </header>

                <div className="profile-grid">
                    {/* SECTION 2 & 3: FORM / HEALTH */}
                    <div className="profile-main">
                        <section className="glass p-section">
                            <h3>{isEditing ? 'Edit Information' : 'Personal Details'}</h3>
                            {isEditing ? (
                                <form className="profile-form" onSubmit={handleSave}>
                                    <div className="form-group">
                                        <label>Age</label>
                                        <input type="number" value={form.age || ''} onChange={e => setForm({ ...form, age: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Gender</label>
                                        <select value={form.gender || ''} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                            <option value="">Select</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Height (cm)</label>
                                            <input type="number" value={form.height || ''} onChange={e => setForm({ ...form, height: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Weight (kg)</label>
                                            <input type="number" value={form.weight || ''} onChange={e => setForm({ ...form, weight: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Equipment</label>
                                        <select value={form.availableEquipment || 'none'} onChange={e => setForm({ ...form, availableEquipment: e.target.value })}>
                                            <option value="none">None (Bodyweight)</option>
                                            <option value="home">Home Gym</option>
                                            <option value="gym">Full Gym</option>
                                        </select>
                                    </div>
                                    <button type="submit" className="btn btn-primary btn-full mt-2" disabled={loading}>
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </form>
                            ) : (
                                <div className="details-view">
                                    <div className="stat-row"><span>Age:</span> <strong>{user.age || '--'} yrs</strong></div>
                                    <div className="stat-row"><span>Gender:</span> <strong>{user.gender || '--'}</strong></div>
                                    <div className="stat-row"><span>Height:</span> <strong>{user.height || '--'} cm</strong></div>
                                    <div className="stat-row"><span>Weight:</span> <strong>{user.weight || '--'} kg</strong></div>
                                    <div className="stat-row"><span>Equipment:</span> <strong>{user.availableEquipment || 'None'}</strong></div>
                                </div>
                            )}
                        </section>

                        {/* SECTION 3: BMI */}
                        {bmi && (
                            <section className="glass p-section bmi-card">
                                <h3>Health Summary</h3>
                                <div className="bmi-flex">
                                    <div className="bmi-val" style={{ color: bmi.color }}>
                                        <span className="num">{bmi.val}</span>
                                        <span className="cat">{bmi.cat}</span>
                                    </div>
                                    <div className="bmi-guide">
                                        <p>Recommendation: {bmi.cat === 'Normal' ? 'Great job! Maintain your current routine.' : 'Consider adjusting your calorie intake to reach optimal range.'}</p>
                                        <small>Ideal Weight: {Math.round(18.5 * (user.height / 100) ** 2)}kg - {Math.round(25 * (user.height / 100) ** 2)}kg</small>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* SECTION 4 & 5: HEATMAP & STATS */}
                    <div className="profile-side">
                        <section className="glass p-section stats-card">
                            <h3>Activity Stats</h3>
                            <div className="mini-stats">
                                <div className="m-stat">
                                    <span className="s-label">Total Workouts</span>
                                    <span className="s-val">{stats.totalWorkoutsCompleted}</span>
                                </div>
                                <div className="m-stat">
                                    <span className="s-label">Current Streak</span>
                                    <span className="s-val">🔥 {stats.consistencyStreak}</span>
                                </div>
                                <div className="m-stat">
                                    <span className="s-label">Avg Accuracy</span>
                                    <span className="s-val">{stats.averageAccuracy}%</span>
                                </div>
                            </div>
                        </section>

                        <section className="glass p-section heatmap-card">
                            <h3>Activity Heatmap</h3>
                            <div className="heatmap-grid">
                                {heatmapData.map((week, wi) => (
                                    <div key={wi} className="h-week">
                                        {week.map((day, di) => (
                                            <div
                                                key={di}
                                                className={`h-day lvl-${Math.min(day.count, 3)}`}
                                                title={`${day.date}: ${day.count} sessions`}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div className="h-legend">
                                <span>Less</span>
                                <div className="h-day lvl-0" />
                                <div className="h-day lvl-1" />
                                <div className="h-day lvl-2" />
                                <div className="h-day lvl-3" />
                                <span>More</span>
                            </div>
                        </section>
                    </div>
                </div>
            </main>

            <style>{`
                .profile-container { padding: 40px; max-width: 1200px; margin: 0 auto; color: white; display: flex; flex-direction: column; gap: 24px; }
                .glass { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 20px; backdrop-filter: blur(10px); }
                .p-section { padding: 24px; margin-bottom: 24px; }
                .p-section h3 { font-size: 14px; text-transform: uppercase; color: #888; margin-bottom: 20px; letter-spacing: 1px; }

                .profile-header { display: flex; justify-content: space-between; align-items: center; padding: 30px; }
                .user-meta { display: flex; align-items: center; gap: 20px; }
                .user-avatar { width: 60px; height: 60px; background: var(--accent-cyan); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #000; }
                .user-meta h1 { font-size: 24px; margin-bottom: 4px; }
                .user-meta p { font-size: 14px; color: #aaa; }

                .profile-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; }
                
                .details-view { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .stat-row { font-size: 14px; color: #ccc; }
                .stat-row span { color: #666; width: 100px; display: inline-block; }

                .bmi-flex { display: flex; gap: 30px; align-items: center; }
                .bmi-val { text-align: center; border-right: 1px solid #333; padding-right: 30px; }
                .bmi-val .num { display: block; font-size: 40px; font-weight: bold; }
                .bmi-val .cat { font-size: 12px; text-transform: uppercase; font-weight: 800; }
                .bmi-guide { flex: 1; font-size: 14px; color: #aaa; line-height: 1.6; }

                .mini-stats { display: flex; flex-direction: column; gap: 16px; }
                .m-stat { background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
                .s-label { font-size: 12px; color: #888; }
                .s-val { font-size: 16px; font-weight: bold; color: var(--accent-cyan); }

                .heatmap-grid { display: flex; gap: 3px; justify-content: center; }
                .h-week { display: flex; flex-direction: column; gap: 3px; }
                .h-day { width: 12px; height: 12px; border-radius: 2px; background: rgba(255,255,255,0.05); }
                .lvl-1 { background: #0e4429; }
                .lvl-2 { background: #006d32; }
                .lvl-3 { background: #26a641; }
                
                .h-legend { display: flex; justify-content: flex-end; align-items: center; gap: 5px; margin-top: 10px; font-size: 10px; color: #666; }
                
                .profile-form { display: flex; flex-direction: column; gap: 12px; }
                .form-row { display: flex; gap: 12px; }
                .form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
                .form-group label { font-size: 12px; color: #888; }
                .form-group input, .form-group select { padding: 10px; background: #1a1f2e; border: 1px solid #333; color: white; border-radius: 8px; }

                .notice-pill { position: fixed; top: 100px; right: 40px; background: var(--accent-green); color: #000; padding: 10px 20px; border-radius: 30px; font-weight: bold; font-size: 13px; z-index: 1000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            `}</style>
        </div>
    );
}
