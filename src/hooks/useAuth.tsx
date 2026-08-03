import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthUser } from '@/domain/auth/types';
import { subscribeToAuthState } from '@/services/auth';
import { provisionAccount } from '@/services/commands';

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  errorMessage: string | null;
  retryProvisioning: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<Omit<AuthState, 'retryProvisioning'>>({
    user: null, loading: true, errorMessage: null,
  });
  const generation = useRef(0);
  const pendingUser = useRef<AuthUser | null>(null);

  const prepareAccount = useCallback((user: AuthUser) => {
    generation.current += 1;
    const currentGeneration = generation.current;
    pendingUser.current = user;
    setState({ user: null, loading: true, errorMessage: null });
    provisionAccount()
      .then(() => {
        if (currentGeneration === generation.current) {
          pendingUser.current = null;
          setState({ user, loading: false, errorMessage: null });
        }
      })
      .catch(() => {
        if (currentGeneration === generation.current) {
          setState({
            user: null,
            loading: false,
            errorMessage: 'Your account could not be prepared. Check your connection and retry account setup.',
          });
        }
      });
  }, []);

  useEffect(() => {
    return subscribeToAuthState(user => {
      if (!user) {
        generation.current += 1;
        pendingUser.current = null;
        setState({ user: null, loading: false, errorMessage: null });
        return;
      }
      prepareAccount(user);
    });
  }, [prepareAccount]);

  const retryProvisioning = useCallback(() => {
    if (pendingUser.current && !state.loading) prepareAccount(pendingUser.current);
  }, [prepareAccount, state.loading]);
  const value = useMemo(() => ({ ...state, retryProvisioning }), [retryProvisioning, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
};
