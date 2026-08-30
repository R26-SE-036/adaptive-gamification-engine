import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { codeCoachApi } from '../services/codeCoachApi';
import {
    CONFIG,
    clearAuthSession,
    getAuthToken,
    getRefreshToken,
    getRuntimeLearningSessionId,
    getRuntimeUser,
    getRuntimeUserId,
    isAuthenticated,
    normalizeCodeCoachUser,
    setAuthSession
} from '../config';
import { consumeHandoffFragment, devLoginEnabled } from '../lib/codeguru-auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => getRuntimeUser());
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        if (!isAuthenticated()) {
            setUser(null);
            return null;
        }

        try {
            const response = await codeCoachApi.getMe();
            const profile = normalizeCodeCoachUser(response.user);
            setUser(profile);
            setAuthSession({
                accessToken: getAuthToken(),
                refreshToken: getRefreshToken(),
                learningSessionId: getRuntimeLearningSessionId(),
                user: profile
            });
            return profile;
        } catch {
            clearAuthSession();
            setUser(null);
            return null;
        }
    }, []);

    useEffect(() => {
        const bootstrap = async () => {
            // Arriving from the Code Guru portal? The tokens are in the URL
            // fragment. This stores them under the codeguru.* keys this app now
            // reads, and scrubs them from the address bar so the access token
            // does not sit in browser history.
            const adopted = consumeHandoffFragment();

            if (isAuthenticated()) {
                const profile = await refreshUser();

                // A student handed over from the portal has no gamification
                // learning session yet - every game submit needs one.
                if (adopted && profile && !getRuntimeLearningSessionId()) {
                    try {
                        const session = await codeCoachApi.createLearningSession();
                        setAuthSession({ learningSessionId: session.learning_session_id });
                    } catch {
                        // Non-fatal: the dashboard still renders, and a session
                        // is created again on the next sign-in attempt.
                    }
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        };

        bootstrap();
    }, [refreshUser]);

    useEffect(() => {
        const handleExpired = () => {
            clearAuthSession();
            setUser(null);
        };

        window.addEventListener('auth:expired', handleExpired);
        return () => window.removeEventListener('auth:expired', handleExpired);
    }, []);

    const login = useCallback(async (email, password) => {
        const authResponse = await codeCoachApi.login(email, password);
        const loggedInUser = normalizeCodeCoachUser(authResponse.user);

        setAuthSession({
            accessToken: authResponse.tokens.access_token,
            refreshToken: authResponse.tokens.refresh_token,
            user: loggedInUser
        });
        setUser(loggedInUser);

        const sessionResponse = await codeCoachApi.createLearningSession();
        setAuthSession({
            accessToken: authResponse.tokens.access_token,
            refreshToken: authResponse.tokens.refresh_token,
            learningSessionId: sessionResponse.learning_session_id,
            user: loggedInUser
        });

        return loggedInUser;
    }, []);

    const logout = useCallback(async () => {
        await codeCoachApi.logout();
        clearAuthSession();
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        userId: user?.userId || getRuntimeUserId(),
        loading,
        isAuthenticated: Boolean(user?.userId || getRuntimeUserId()),
        login,
        logout,
        refreshUser
    }), [user, loading, login, logout, refreshUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
