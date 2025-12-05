
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc,
  Firestore
} from "firebase/firestore";
import { Task, ProjectMetadata } from "../types";

// 您的 Firebase 設定
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyBB-eoUOhNvxRgAIZdPyedW8rGRnSuQ_is",
  authDomain: "gantt-acbc8.firebaseapp.com",
  projectId: "gantt-acbc8",
  storageBucket: "gantt-acbc8.firebasestorage.app",
  messagingSenderId: "559186172210",
  appId: "1:559186172210:web:6ee3cf957d51c219cedf2b",
  measurementId: "G-5CCRZFVWTV"
};

const CUSTOM_CONFIG_KEY = "firebase_custom_config_v2";
const COLLECTION_NAME = "projects";

let db: Firestore | null = null;

// 初始化邏輯
const initFirebase = () => {
  try {
    let config = DEFAULT_CONFIG;

    // 檢查是否有使用者自訂的設定 (LocalStorage)
    try {
      const stored = localStorage.getItem(CUSTOM_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.apiKey && parsed.projectId) {
           config = parsed;
           console.log("Using custom Firebase config from storage");
        }
      }
    } catch (e) {
      console.warn("Failed to parse custom config, using default.");
    }

    // 初始化 Firebase (V9 Modular Syntax)
    // Use named import for initializeApp if available, or namespace
    const app = initializeApp(config);
    db = getFirestore(app);
    console.log("Firebase initialized successfully with project:", config.projectId);
    
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
};

// 立即執行初始化
initFirebase();

// --- Helper Functions ---

export const updateFirebaseConfig = (configStr: string): boolean => {
  try {
    let jsonStr = configStr;
    const firstBrace = configStr.indexOf('{');
    const lastBrace = configStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = configStr.substring(firstBrace, lastBrace + 1);
    }

    const parseFn = new Function(`return ${jsonStr};`);
    const config = parseFn();

    if (config && config.apiKey && config.projectId) {
        localStorage.setItem(CUSTOM_CONFIG_KEY, JSON.stringify(config));
        return true;
    }
    return false;
  } catch (e) {
    console.error("Config update error", e);
    return false;
  }
};

export const clearFirebaseConfig = () => {
    localStorage.removeItem(CUSTOM_CONFIG_KEY);
    window.location.reload();
};

export const isFirebaseReady = () => !!db;

// --- Project Management Functions (V9 Modular Syntax) ---

export const fetchProjects = async (): Promise<ProjectMetadata[]> => {
  if (!db) return [];
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    return querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || "未命名專案",
        description: data.description || "",
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        taskCount: data.tasks?.length || 0
      };
    });
  } catch (e) {
    console.error("Error fetching projects:", e);
    throw e;
  }
};

export const createProject = async (project: ProjectMetadata, initialTasks: Task[] = []): Promise<boolean> => {
  if (!db) return false;
  try {
    await setDoc(doc(db, COLLECTION_NAME, project.id), {
      name: project.name,
      description: project.description,
      lastUpdated: project.lastUpdated,
      tasks: initialTasks
    });
    return true;
  } catch (e) {
    console.error("Error creating project:", e);
    throw e;
  }
};

export const updateProjectMetadata = async (projectId: string, name: string, description: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const docRef = doc(db, COLLECTION_NAME, projectId);
    await setDoc(docRef, { 
      name, 
      description, 
      lastUpdated: new Date().toISOString() 
    }, { merge: true });
    return true;
  } catch (e) {
    console.error("Error updating project metadata:", e);
    throw e;
  }
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, projectId));
    return true;
  } catch (e) {
    console.error("Error deleting project:", e);
    throw e;
  }
};

export const saveTasksToFirebase = async (projectId: string, tasks: Task[], projectMeta?: Partial<ProjectMetadata>) => {
  if (!db) return false;
  try {
    const updateData: any = {
      tasks: tasks,
      lastUpdated: new Date().toISOString()
    };
    
    if (projectMeta) {
      if (projectMeta.name) updateData.name = projectMeta.name;
      if (projectMeta.description) updateData.description = projectMeta.description;
    }

    await setDoc(doc(db, COLLECTION_NAME, projectId), updateData, { merge: true });
    return true;
  } catch (e) {
    console.error("Error saving to Firebase:", e);
    throw e;
  }
};

export const loadTasksFromFirebase = async (projectId: string): Promise<Task[] | null> => {
  if (!db) return null;
  try {
    const docRef = doc(db, COLLECTION_NAME, projectId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data()?.tasks as Task[];
    } else {
      return null;
    }
  } catch (e: any) {
    console.error("Error loading from Firebase:", e);
    throw e;
  }
};
