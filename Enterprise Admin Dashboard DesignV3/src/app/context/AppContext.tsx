import { createContext, useContext, useState, ReactNode } from 'react';
import { Project, mockProjects } from '../data/mockData';

interface AppContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  projects: Project[];
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  return (
    <AppContext.Provider value={{ currentProject, setCurrentProject, projects: mockProjects }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
