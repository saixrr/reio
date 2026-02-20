import { useEffect, useState, useMemo } from 'react';
import Navbar from '../components/Navbar';

/* ── NUTRITION KNOWLEDGE BASE ─────────────────────────────── */
const INGREDIENT_DATA = {
    'Rice': { kcal: 1.3, p: 0.027, c: 0.28, f: 0.003, unit: 'g' },
    'Eggs': { kcal: 77, p: 6.5, c: 0.5, f: 5.5, unit: 'units' },
    'Dal': { kcal: 1.16, p: 0.09, c: 0.2, f: 0.004, unit: 'g' },
    'Milk': { kcal: 0.42, p: 0.034, c: 0.05, f: 0.01, unit: 'ml' },
    'Chicken': { kcal: 1.65, p: 0.31, c: 0, f: 0.036, unit: 'g' },
    'Paneer': { kcal: 2.65, p: 0.18, c: 0.012, f: 0.2, unit: 'g' },
    'Oats': { kcal: 3.89, p: 0.169, c: 0.66, f: 0.069, unit: 'g' },
    'Banana': { kcal: 89, p: 1.1, c: 23, f: 0.3, unit: 'units' },
    'Veggies': { kcal: 0.43, p: 0.02, c: 0.07, f: 0.001, unit: 'g' },
};

export default function NutritionPage() {
    // ── Profile State ─────────────────────────────────────────
    const [profile, setProfile] = useState(() => {
        const saved = localStorage.getItem('nutri_profile_v5');
        return saved ? JSON.parse(saved) : { height: 175, weight: 75, age: 28, gender: 'male', goal: 'muscle_gain', activity: 'high' };
    });

    // ── Inventory & Consumption State ─────────────────────────
    const [inventory, setInventory] = useState([
        { name: 'Rice', qty: 1000, unit: 'g' },
        { name: 'Eggs', qty: 10, unit: 'units' },
        { name: 'Milk', qty: 500, unit: 'ml' },
        { name: 'Banana', qty: 4, unit: 'units' },
    ]);
    const [newItem, setNewItem] = useState({ name: 'Rice', qty: '', unit: 'g' });
    const [consumedMeals, setConsumedMeals] = useState([]);
    const [showProfile, setShowProfile] = useState(false);

    useEffect(() => {
        localStorage.setItem('nutri_profile_v5', JSON.stringify(profile));
    }, [profile]);

    // ── Core Nutrient Targets ─────────────────────────────────
    const targets = useMemo(() => {
        let bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
        bmr = profile.gender === 'male' ? bmr + 5 : bmr - 161;
        const multiplier = profile.activity === 'high' ? 1.6 : 1.3;
        let tdee = bmr * multiplier;

        if (profile.goal === 'weight_loss') tdee -= 500;
        if (profile.goal === 'muscle_gain') tdee += 400;

        return {
            kcal: Math.round(tdee),
            p: Math.round(profile.weight * (profile.goal === 'muscle_gain' ? 2.2 : 1.6)),
            c: Math.round((tdee * 0.45) / 4),
            f: Math.round((tdee * 0.25) / 9)
        };
    }, [profile]);

    const bmi = useMemo(() => {
        const h = profile.height / 100;
        return (profile.weight / (h * h)).toFixed(1);
    }, [profile]);

    // ── ALLOCATION ALGORITHM ──────────────────────────────────
    const generatedMeals = useMemo(() => {
        if (inventory.every(i => i.qty <= 0)) return [];

        const slots = [
            { type: 'Breakfast', ratio: 0.25, pref: ['Oats', 'Milk', 'Banana', 'Eggs'] },
            { type: 'Lunch', ratio: 0.30, pref: ['Rice', 'Dal', 'Chicken', 'Paneer', 'Veggies'] },
            { type: 'Pre-Workout', ratio: 0.10, pref: ['Banana', 'Rice', 'Oats'] }, // Carbs focus
            { type: 'Post-Workout', ratio: 0.15, pref: ['Eggs', 'Chicken', 'Milk', 'Paneer'] }, // Protein focus
            { type: 'Dinner', ratio: 0.20, pref: ['Chicken', 'Paneer', 'Rice', 'Veggies'] },
        ];

        // Clone inventory for internal allocation
        let pool = inventory.map(i => ({ ...i }));

        return slots.map(slot => {
            const mealIngredients = [];
            const slotTargets = {
                kcal: targets.kcal * slot.ratio,
                p: targets.p * slot.ratio,
            };

            // Attempt to fill slot based on preferences
            slot.pref.forEach(pName => {
                const stock = pool.find(i => i.name === pName);
                if (stock && stock.qty > 0) {
                    const data = INGREDIENT_DATA[pName];
                    let amt = 0;

                    // Simple heuristic: Take a portion of what's allowed for this meal slot
                    if (data.unit === 'units') {
                        amt = Math.min(stock.qty, pName === 'Banana' ? 1 : 2);
                    } else {
                        // Allot ~some base amount for the slot
                        amt = Math.min(stock.qty, pName === 'Rice' ? 150 : 100);
                    }

                    if (amt > 0) {
                        mealIngredients.push({ name: pName, qty: amt, unit: data.unit });
                        stock.qty -= amt;
                    }
                }
            });

            return {
                id: slot.type,
                type: slot.type,
                name: `${slot.type} Choice`,
                ingredients: mealIngredients,
                stats: mealIngredients.reduce((acc, ing) => {
                    const d = INGREDIENT_DATA[ing.name];
                    acc.kcal += d.kcal * ing.qty;
                    acc.p += d.p * ing.qty;
                    return acc;
                }, { kcal: 0, p: 0 })
            };
        });
    }, [inventory, targets]);

    const currentIntake = useMemo(() => {
        return consumedMeals.reduce((acc, meal) => {
            acc.kcal += meal.stats.kcal;
            acc.p += meal.stats.p;
            return acc;
        }, { kcal: 0, p: 0 });
    }, [consumedMeals]);

    const shortages = useMemo(() => {
        if (currentIntake.kcal >= targets.kcal && currentIntake.p >= targets.p) return [];
        const gaps = [];
        if (currentIntake.p < targets.p) gaps.push({ name: 'Protein Source', need: targets.p - currentIntake.p, unit: 'g' });
        if (currentIntake.kcal < targets.kcal) gaps.push({ name: 'Energy Source', need: targets.kcal - currentIntake.kcal, unit: 'kcal' });
        return gaps;
    }, [currentIntake, targets]);

    // ── Handlers ──────────────────────────────────────────────
    const addIngredient = (e) => {
        e.preventDefault();
        if (!newItem.qty) return;
        setInventory(prev => {
            const exists = prev.find(i => i.name === newItem.name);
            if (exists) return prev.map(i => i.name === newItem.name ? { ...i, qty: i.qty + Number(newItem.qty) } : i);
            return [...prev, { ...newItem, qty: Number(newItem.qty) }];
        });
        setNewItem({ ...newItem, qty: '' });
    };

    const toggleMeal = (meal) => {
        const isEaten = consumedMeals.some(m => m.id === meal.id);
        if (isEaten) {
            setConsumedMeals(prev => prev.filter(m => m.id !== meal.id));
            setInventory(prev => prev.map(inv => {
                const usage = meal.ingredients.find(ing => ing.name === inv.name);
                return usage ? { ...inv, qty: inv.qty + usage.qty } : inv;
            }));
        } else {
            setConsumedMeals([...consumedMeals, meal]);
            setInventory(prev => prev.map(inv => {
                const usage = meal.ingredients.find(ing => ing.name === inv.name);
                return usage ? { ...inv, qty: inv.qty - usage.qty } : inv;
            }));
        }
    };

    // ── Components ────────────────────────────────────────────
    const Meter = ({ label, val, target, color }) => {
        const perc = Math.min(100, Math.round((val / target) * 100));
        return (
            <div className="v5-meter">
                <div className="meter-info"><span>{label}</span> <span>{Math.round(val)}/{target}</span></div>
                <div className="meter-track"><div className="meter-bar" style={{ width: `${perc}%`, background: color }} /></div>
            </div>
        );
    };

    return (
        <div className="page-shell">
            <Navbar />
            <main className="nutri-v5">
                {/* SECTION: DASHBOARD */}
                <section className="v5-card dash-v5">
                    <div className="dash-head">
                        <h2>📊 Intake Progress</h2>
                        <div className="profile-pill" onClick={() => setShowProfile(!showProfile)}>
                            BMI: {bmi} • {profile.goal.replace('_', ' ')} ⚙
                        </div>
                    </div>
                    {showProfile && (
                        <div className="profile-pop">
                            <input type="number" value={profile.weight} onChange={e => setProfile({ ...profile, weight: e.target.value })} placeholder="Kg" />
                            <select value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })}>
                                <option value="muscle_gain">Muscle Gain</option>
                                <option value="weight_loss">Fat Loss</option>
                            </select>
                            <select value={profile.activity} onChange={e => setProfile({ ...profile, activity: e.target.value })}>
                                <option value="high">Workout Day</option>
                                <option value="low">Rest Day</option>
                            </select>
                        </div>
                    )}
                    <div className="meters-v5">
                        <Meter label="Calories" val={currentIntake.kcal} target={targets.kcal} color="var(--accent-cyan)" />
                        <Meter label="Protein" val={currentIntake.p} target={targets.p} color="var(--accent-purple)" />
                    </div>
                </section>

                <div className="layout-v5">
                    {/* SECTION: INVENTORY */}
                    <aside className="v5-card inv-v5">
                        <h3>📦 Kitchen Pantry</h3>
                        <form className="inv-form-v5" onSubmit={addIngredient}>
                            <select value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value, unit: INGREDIENT_DATA[e.target.value].unit })}>
                                {Object.keys(INGREDIENT_DATA).map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <input type="number" placeholder="Qty" value={newItem.qty} onChange={e => setNewItem({ ...newItem, qty: e.target.value })} required />
                            <button type="submit">+</button>
                        </form>
                        <div className="inv-list-v5">
                            {inventory.filter(i => i.qty > 0).map(item => (
                                <div key={item.name} className="inv-row-v5">
                                    <span>{item.name}</span>
                                    <span>{item.qty}{item.unit}</span>
                                </div>
                            ))}
                        </div>
                    </aside>

                    {/* SECTION: MEALS */}
                    <section className="meals-v5">
                        <h3>🗓 Daily Allocation (Inventory-Only)</h3>
                        <div className="meals-grid-v5">
                            {generatedMeals.map(meal => {
                                const active = consumedMeals.some(m => m.id === meal.id);
                                return (
                                    <div key={meal.id} className={`meal-v5 ${active ? 'eaten' : ''}`} onClick={() => toggleMeal(meal)}>
                                        <div className="m-tag">{meal.type}</div>
                                        <h4>{meal.ingredients.length > 0 ? meal.name : 'Empty Slot'}</h4>
                                        <div className="m-ings-v5">
                                            {meal.ingredients.map(i => <div key={i.name}>• {i.qty}{i.unit} {i.name}</div>)}
                                            {meal.ingredients.length === 0 && <div className="no-ing">Add ingredients to fill this slot</div>}
                                        </div>
                                        <div className="m-stats-v5">
                                            <span>🔥 {Math.round(meal.stats.kcal)}kcal</span>
                                            <span>💪 {Math.round(meal.stats.p)}g P</span>
                                        </div>
                                        <div className="m-btn-v5">{active ? '✅ Logged' : '🍽 Eat'}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* SECTION: SHOP & TIPS */}
                    <aside className="right-v5">
                        {shortages.length > 0 && (
                            <div className="v5-card shop-v5">
                                <h3>🛒 Deficient Targets</h3>
                                {shortages.map(s => (
                                    <div key={s.name} className="shop-item-v5">
                                        <div className="s-label">{s.name} Gap</div>
                                        <div className="s-val">+{Math.round(s.need)}{s.unit} needed</div>
                                        <a href={`https://www.bigbasket.com/ps/?q=${s.name.split(' ')[0]}`} target="_blank">Order ↗</a>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="v5-card tips-v5">
                            <h3>💡 Advice</h3>
                            <p>{currentIntake.p < targets.p ? 'Daily protein is priority. Consider adding eggs or milk.' : 'Great job! Ingredients well distributed.'}</p>
                        </div>
                    </aside>
                </div>
            </main>

            <style>{`
                .nutri-v5 { padding: 40px; max-width: 1400px; margin: 0 auto; color: white; display: flex; flex-direction: column; gap: 24px; }
                .v5-card { background: rgba(30, 35, 55, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 24px; backdrop-filter: blur(20px); }
                
                .dash-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
                .profile-pill { background: rgba(255,255,255,0.05); padding: 8px 16px; border-radius: 20px; font-size: 13px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
                .profile-pop { display: flex; gap: 10px; margin-bottom: 20px; animation: slideDown 0.3s ease; }
                .profile-pop * { flex: 1; padding: 10px; background: #1a1f2e; border: 1px solid #333; color: white; border-radius: 8px; }

                .meters-v5 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
                .meter-info { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; font-weight: bold; }
                .meter-track { height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
                .meter-bar { height: 100%; transition: width 0.8s ease; }

                .layout-v5 { display: grid; grid-template-columns: 280px 1fr 280px; gap: 24px; }
                h3 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
                
                .inv-form-v5 { display: flex; gap: 5px; margin-bottom: 20px; }
                .inv-form-v5 * { flex: 1; min-width: 0; padding: 8px; background: #1a1f2e; border: 1px solid #333; color: white; border-radius: 6px; font-size: 12px; }
                .inv-form-v5 button { flex: 0 0 40px; background: var(--accent-cyan); color: #000; border: none; font-weight: bold; }

                .inv-list-v5 { display: flex; flex-direction: column; gap: 8px; }
                .inv-row-v5 { display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 10px; font-size: 13px; }

                .meals-grid-v5 { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
                .meal-v5 { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 20px; cursor: pointer; transition: 0.3s; }
                .meal-v5:hover { transform: translateY(-5px); border-color: var(--accent-cyan); }
                .meal-v5.eaten { border-color: var(--accent-green); background: rgba(34, 197, 94, 0.05); }
                
                .m-tag { color: var(--accent-cyan); font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; }
                .meal-v5 h4 { font-size: 16px; margin-bottom: 15px; }
                .m-ings-v5 { font-size: 11px; color: #aaa; min-height: 60px; margin-bottom: 20px; line-height: 1.6; }
                .m-stats-v5 { display: flex; gap: 10px; font-size: 12px; font-weight: bold; }
                .m-btn-v5 { margin-top: 20px; text-align: right; font-size: 11px; font-weight: bold; color: var(--accent-cyan); }
                .no-ing { color: #555; font-style: italic; }

                .right-v5 { display: flex; flex-direction: column; gap: 24px; }
                .shop-item-v5 { background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 15px; margin-bottom: 10px; }
                .s-label { font-size: 11px; color: #f87171; text-transform: uppercase; }
                .s-val { font-size: 13px; font-weight: bold; margin: 5px 0 10px; }
                .shop-item-v5 a { font-size: 11px; color: var(--accent-gold); text-decoration: none; font-weight: bold; }
                
                .tips-v5 p { font-size: 13px; line-height: 1.6; color: #ccc; }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
