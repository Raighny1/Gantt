import React, { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import ProjectBoard from './components/ProjectBoard';
import ConfigModal from './components/ConfigModal';
import { isFirebaseReady } from './services/firebaseConfig';

type ViewState = 'LIST' | 'BOARD';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('LIST');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [useFirebase, setUseFirebase] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Initial check for Firebase config status
  useEffect(() => {
    setUseFirebase(isFirebaseReady());
  }, []);

  const handleOpenProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    setView('BOARD');
  };

  const handleBackToDashboard = () => {
    setView('LIST');
    setCurrentProjectId(null);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Global Config Button (Only visible on List view to avoid clutter, or maybe always?) */}
      {view === 'LIST' && (
        <div className="fixed top-4 right-4 z-50">
             <button 
                onClick={() => setIsConfigOpen(true)}
                className="flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
             >
                <div className={`w-2 h-2 rounded-full ${useFirebase ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span>{useFirebase ? '已連線雲端' : '設定資料庫'}</span>
             </button>
        </div>
      )}

      {view === 'LIST' ? (
        <ProjectList 
          onOpenProject={handleOpenProject} 
          useFirebase={useFirebase}
        />
      ) : (
        currentProjectId && (
          <ProjectBoard 
            projectId={currentProjectId} 
            onBack={handleBackToDashboard}
            useFirebase={useFirebase}
          />
        )
      )}

      <ConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => {
            setIsConfigOpen(false);
            setUseFirebase(isFirebaseReady()); // Update state after potential config change
        }} 
      />
    </div>
  );
};

export default App;