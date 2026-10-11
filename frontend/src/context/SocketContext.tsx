import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../lib/api';
import { useAuth } from './AuthContext';

interface SocketCtx {
  socket: Socket | null;
  on: (event: string, cb: (data: any) => void) => void;
  off: (event: string, cb: (data: any) => void) => void;
}

const Ctx = createContext<SocketCtx>({ socket: null, on: () => {}, off: () => {} });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || !user) {
      ref.current?.disconnect();
      ref.current = null;
      setSocket(null);
      return;
    }
    const s = io(API_URL || window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    ref.current = s;
    setSocket(s);
    return () => {
      s.disconnect();
      ref.current = null;
    };
  }, [token, user?.id]);

  const value = useMemo(
    () => ({
      socket,
      on: (event: string, cb: (data: any) => void) => socket?.on(event, cb),
      off: (event: string, cb: (data: any) => void) => socket?.off(event, cb),
    }),
    [socket],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);