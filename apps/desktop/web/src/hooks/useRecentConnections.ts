import { useState, useCallback, useEffect } from 'react';
import { RecentConnection } from '../components/connect/RecentConnectionsPanel';

const STORAGE_KEY = 'ssh-recent-connections-v1';
const MAX_RECENT_CONNECTIONS = 8;

export interface ConnectionToSave {
  host: string;
  port: number;
  user: string;
}

export function useRecentConnections() {
  const [recentConnections, setRecentConnections] = useState<RecentConnection[]>([]);

  // Cargar historial al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentConnection[];
        // Filtrar conexiones antiguas (> 30 días)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const filtered = parsed.filter(conn => conn.lastConnected > thirtyDaysAgo);
        setRecentConnections(filtered);
        
        // Si se filtraron algunas, actualizar storage
        if (filtered.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        }
      }
    } catch (error) {
      console.error('Error loading recent connections:', error);
      setRecentConnections([]);
    }
  }, []);

  // Guardar conexión en el historial
  const saveConnection = useCallback((connection: ConnectionToSave) => {
    try {
      setRecentConnections(prev => {
        // Buscar si ya existe esta conexión (mismo host, port, user)
        const existingIndex = prev.findIndex(
          conn => 
            conn.host === connection.host && 
            conn.port === connection.port && 
            conn.user === connection.user
        );

        let updated: RecentConnection[];
        const now = Date.now();

        if (existingIndex !== -1) {
          // Ya existe: mover al inicio y actualizar timestamp
          const existing = prev[existingIndex];
          updated = [
            { ...existing, lastConnected: now },
            ...prev.slice(0, existingIndex),
            ...prev.slice(existingIndex + 1)
          ];
        } else {
          // Nueva conexión: agregar al inicio
          const newConnection: RecentConnection = {
            id: `${connection.host}-${connection.port}-${connection.user}-${now}`,
            host: connection.host,
            port: connection.port,
            user: connection.user,
            lastConnected: now,
          };
          updated = [newConnection, ...prev];
        }

        // Limitar a MAX_RECENT_CONNECTIONS
        const limited = updated.slice(0, MAX_RECENT_CONNECTIONS);

        // Persistir en localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));

        return limited;
      });
    } catch (error) {
      console.error('Error saving recent connection:', error);
    }
  }, []);

  // Limpiar historial
  const clearConnections = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setRecentConnections([]);
    } catch (error) {
      console.error('Error clearing recent connections:', error);
    }
  }, []);

  // Eliminar una conexión específica
  const removeConnection = useCallback((id: string) => {
    try {
      setRecentConnections(prev => {
        const updated = prev.filter(conn => conn.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error('Error removing connection:', error);
    }
  }, []);

  return {
    recentConnections,
    saveConnection,
    clearConnections,
    removeConnection,
  };
}
