import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
    const token = localStorage.getItem('token');
    const location = useLocation();

    if (!token) return <Navigate to="/login" replace />;

    // First-time onboarding: redirect to profile-setup if profile not completed
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isOnboarding = location.pathname === '/profile-setup';
    if (!user.profileComplete && !isOnboarding) {
        return <Navigate to="/profile-setup" replace />;
    }

    return children;
}
