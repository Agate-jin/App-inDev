
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThumbnailVersion, Layout, EditMode, Project, ChatMessage, Layer } from './types';
import { QUICK_ACTIONS, CINEMATIC_EFFECTS, SCRATCH_TEMPLATES, MAX_SNAPSHOTS } from './constants';
import { editImage, generateNewImage } from './services/geminiService';
import { fileToBase64, downloadImage, composeImage } from './utils/imageUtils';
import { GoogleGenAI } from "@google/genai";

const DB_NAME = 'ThumbAI_Studio_DB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

const DEFAULT_LAYOUT: Layout = {
  scale: 1,
  stretchX: 1,
  stretchY: 1,
  translateX: 0,
  translateY: 0
};

interface ModalConfig {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  isError?: boolean;
}

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveProjectsToDB = async (projects: Project[]) => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const clearReq = store.clear();
  return new Promise<void>((resolve, reject) => {
    clearReq.onsuccess = () => {
      let completed = 0;
      if (projects.length === 0) resolve();
      projects.forEach(p => {
        const req = store.add(p);
        req.onsuccess = () => {
          completed++;
          if (completed === projects.length) resolve();
        };
        req.onerror = () => reject(req.error);
      });
    };
  });
};

const loadProjectsFromDB = async (): Promise<Project[]> => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  const [history, setHistory] = useState<ThumbnailVersion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Processing...");
  const [prompt, setPrompt] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [baseLayout, setBaseLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [activeLayerId, setActiveLayerId] = useState<string>('base');
  const [editMode, setEditMode] = useState<EditMode>('styles');
  const [modal, setModal] = useState<ModalConfig | null>(null);
  
  // Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<'base' | 'layer'>('base');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const currentVersion = currentIdx >= 0 && currentIdx < history.length ? history[currentIdx] : null;
  const activeProject = projects.find(p => p.id === activeProjectId);

  // Sync background layout when history version changes
  useEffect(() => {
    if (currentVersion) {
      setBaseLayout(currentVersion.baseLayout || DEFAULT_LAYOUT);
    }
  }, [currentIdx, history]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    loadProjectsFromDB().then(setProjects);
  }, []);

  const persistProjects = useCallback(async (projectsToSave: Project[]) => {
    try {
      await saveProjectsToDB(projectsToSave);
    } catch (e) {
      console.error("Storage Error:", e);
      setError("Storage error. Database might be full.");
    }
  }, []);

  const updateActiveTransform = (key: keyof Layout, value: number) => {
    if (activeLayerId === 'base') {
      const nextLayout = { ...baseLayout, [key]: value };
      setBaseLayout(nextLayout);
      // Sync to history immediately so exports work correctly
      if (currentVersion) {
        const newHistory = [...history];
        newHistory[currentIdx] = { ...currentVersion, baseLayout: nextLayout };
        setHistory(newHistory);
      }
    } else if (currentVersion) {
      const updatedLayers = currentVersion.layers.map(l => 
        l.id === activeLayerId ? { ...l, layout: { ...l.layout, [key]: value } } : l
      );
      const newHistory = [...history];
      newHistory[currentIdx] = { ...currentVersion, layers: updatedLayers };
      setHistory(newHistory);
    }
  };

  const executeStartNewProject = () => {
    setHistory([]);
    setCurrentIdx(-1);
    setActiveProjectId(null);
    setBaseLayout(DEFAULT_LAYOUT);
    setActiveLayerId('base');
    setPrompt("");
    setError(null);
    setChatMessages([]);
    setIsProfileOpen(false);
    setModal(null);
  };

  const startNewProject = (e: React.MouseEvent) => {
    e.preventDefault();
    if (history.length > 0) {
      setModal({
        title: "New Project",
        message: "Unsaved changes will be lost. Ready to start fresh?",
        confirmLabel: "Create New",
        onConfirm: executeStartNewProject
      });
    } else {
      executeStartNewProject();
    }
  };

  const addToHistory = (url: string, p?: string, layers: Layer[] = [], customBaseLayout?: Layout) => {
    const newVersion: ThumbnailVersion = {
      id: Math.random().toString(36).substring(7),
      url,
      layers,
      baseLayout: customBaseLayout || baseLayout,
      prompt: p,
      timestamp: Date.now(),
    };
    const newHistory = [...history.slice(0, currentIdx + 1), newVersion];
    setHistory(newHistory);
    setCurrentIdx(newHistory.length - 1);
  };

  const storeCurrentProjectState = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentVersion) return;
    
    let updatedProjects: Project[];
    if (activeProjectId) {
      updatedProjects = projects.map(p => p.id === activeProjectId ? {
        ...p,
        thumbnailUrl: currentVersion.url,
        revisionStack: [...history],
        timestamp: Date.now()
      } : p);
    } else {
      const newId = Math.random().toString(36).substring(7);
      const newProject: Project = {
        id: newId,
        name: `Thumbnail ${projects.length + 1}`,
        thumbnailUrl: currentVersion.url,
        timestamp: Date.now(),
        revisionStack: [...history],
        snapshots: []
      };
      updatedProjects = [newProject, ...projects];
      setActiveProjectId(newId);
    }

    setProjects(updatedProjects);
    await persistProjects(updatedProjects);
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 2000);
  };

  const loadProject = (project: Project) => {
    setActiveProjectId(project.id);
    setHistory(project.revisionStack);
    setCurrentIdx(project.revisionStack.length - 1);
    const lastVersion = project.revisionStack[project.revisionStack.length - 1];
    setBaseLayout(lastVersion?.baseLayout || DEFAULT_LAYOUT);
    setActiveLayerId('base');
    setModal(null);
    setIsProfileOpen(false);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({
      title: "Delete Project",
      message: "This action is permanent. Are you absolutely sure?",
      confirmLabel: "Delete Forever",
      onConfirm: async () => {
        const updated = projects.filter(p => p.id !== id);
        setProjects(updated);
        await persistProjects(updated);
        if (activeProjectId === id) {
          executeStartNewProject();
        }
        setModal(null);
      }
    });
  };

  const createSnapshot = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentVersion || !activeProjectId) return;
    const currentSnapshots = activeProject?.snapshots || [];
    const newSnapshot = { ...currentVersion, timestamp: Date.now() };
    const updatedSnapshots = [newSnapshot, ...currentSnapshots].slice(0, MAX_SNAPSHOTS);
    const updatedProjects = projects.map(p => p.id === activeProjectId ? { ...p, snapshots: updatedSnapshots } : p);
    setProjects(updatedProjects);
    await persistProjects(updatedProjects);
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 1500);
  };

  const handleBaseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      setStatusMessage("Importing image...");
      setIsImportModalOpen(false);
      try {
        const b64 = await fileToBase64(file);
        addToHistory(b64, "Subject Upload", [], DEFAULT_LAYOUT);
      } catch (err: any) {
        setError("Failed to import asset.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleLayerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentVersion) {
      setIsProcessing(true);
      setStatusMessage("Adding layer...");
      setIsImportModalOpen(false);
      try {
        const b64 = await fileToBase64(file);
        const newLayer: Layer = {
          id: Math.random().toString(36).substring(7),
          url: b64,
          name: `Layer ${currentVersion.layers.length + 1}`,
          layout: { ...DEFAULT_LAYOUT, scale: 0.5 }
        };
        const updatedLayers = [...currentVersion.layers, newLayer];
        addToHistory(currentVersion.url, "Added Image Layer", updatedLayers);
        setActiveLayerId(newLayer.id);
        setEditMode('transform');
      } catch (err: any) {
        setError("Failed to add layer.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const removeLayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentVersion) return;
    const updatedLayers = currentVersion.layers.filter(l => l.id !== id);
    addToHistory(currentVersion.url, "Removed Layer", updatedLayers);
    if (activeLayerId === id) setActiveLayerId('base');
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    const initCamera = async () => {
      if (isCameraActive && !capturedImage && videoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } });
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) { setError("Camera unavailable."); }
      }
    };
    initCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [isCameraActive, capturedImage]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        setCapturedImage(canvas.toDataURL('image/png'));
        if (countdownIntervalRef.current) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
      }
    }
  };

  const startAutoCapture = (seconds: number) => {
    setCountdown(seconds);
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(p => {
        if (p && p <= 1) { 
          capturePhoto(); 
          window.clearInterval(countdownIntervalRef.current!); 
          countdownIntervalRef.current = null;
          return null; 
        }
        return p ? p - 1 : null;
      });
    }, 1000);
  };

  const confirmCapture = () => {
    if (capturedImage) {
      if (importTarget === 'layer' && currentVersion) {
        const newLayer: Layer = {
          id: Math.random().toString(36).substring(7),
          url: capturedImage,
          name: "Camera Shot",
          layout: { ...DEFAULT_LAYOUT, scale: 0.5 }
        };
        addToHistory(currentVersion.url, "Camera Layer", [...currentVersion.layers, newLayer]);
        setActiveLayerId(newLayer.id);
      } else {
        addToHistory(capturedImage, "Camera Base", [], DEFAULT_LAYOUT);
      }
      setIsCameraActive(false);
      setIsImportModalOpen(false);
      setCapturedImage(null);
    }
  };

  const handleEdit = async (customPrompt?: string) => {
    const rawPrompt = (customPrompt || prompt).trim();
    if (!currentVersion || (!rawPrompt && editMode !== 'transform')) return; 
    setIsProcessing(true);
    try {
      setStatusMessage("Consolidating visual data...");
      const composedB64 = await composeImage(currentVersion.url, baseLayout, currentVersion.layers);
      setStatusMessage("AI Studio synthesis...");
      const result = await editImage(composedB64, rawPrompt || "Clean background removal.");
      addToHistory(result, rawPrompt || "AI Edit", [], DEFAULT_LAYOUT);
      setBaseLayout(DEFAULT_LAYOUT);
      setPrompt("");
    } catch (err: any) { 
      setError("Visual synthesis failed. Please try again."); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  const handleGenerateFromScratch = async (templatePrompt: string) => {
    setIsProcessing(true);
    setStatusMessage("Building world...");
    try {
      const result = await generateNewImage(templatePrompt);
      addToHistory(result, templatePrompt, [], DEFAULT_LAYOUT);
    } catch (err: any) { 
      setError("Background generation failed."); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isProcessing) return;
    const userText = chatInput;
    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setIsProcessing(true);
    setStatusMessage("Consulting expert...");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let contents: any = userText;
      if (currentVersion) {
        const composedB64 = await composeImage(currentVersion.url, baseLayout, currentVersion.layers);
        contents = {
          parts: [
            { inlineData: { data: composedB64.split(',')[1], mimeType: 'image/png' } },
            { text: userText }
          ]
        };
      }
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: "You are Thumbio Coach. Analyze thumbnails for CTR. Be blunt, fast, and actionable. Focus on clarity, faces, and emotional contrast.",
        }
      });
      const aiMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        text: response.text || "I'm having trouble viewing the frame. Say again?",
        timestamp: Date.now(),
      };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      setError("Coach is currently busy with another creator.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openImportModal = (target: 'base' | 'layer') => {
    setImportTarget(target);
    setIsImportModalOpen(true);
  };

  const currentActiveLayout = activeLayerId === 'base' ? baseLayout : (currentVersion?.layers.find(l => l.id === activeLayerId)?.layout || DEFAULT_LAYOUT);

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-[#f5f5f7] font-sans overflow-hidden selection:bg-blue-500/30">
      {error && (
        <div className="fixed top-20 right-6 z-[250] bg-red-600/95 backdrop-blur-md text-white px-6 py-4 rounded-3xl shadow-[0_20px_50px_rgba(220,38,38,0.3)] border border-white/10 flex items-center gap-4 animate-in slide-in-from-right-10">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <span className="font-semibold">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-white/10 rounded-full transition-colors">✕</button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl">
          <div className="w-full max-w-[440px] bg-[#1c1c1e] rounded-[40px] p-10 shadow-2xl border border-white/5 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold mb-3 text-center tracking-tight">{modal.title}</h3>
            <p className="text-[#a1a1a6] text-center mb-10 leading-relaxed">{modal.message}</p>
            <div className="flex flex-col gap-3">
              <button onClick={modal.onConfirm} className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all shadow-lg active:scale-95">{modal.confirmLabel}</button>
              <button onClick={() => setModal(null)} className="w-full py-5 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white font-semibold rounded-2xl transition-all active:scale-95">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl">
          <div className="w-full max-w-[700px] bg-[#1c1c1e] rounded-[48px] p-10 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border border-white/5">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold tracking-tight">
                {isCameraActive ? (capturedImage ? "Photo Review" : "Live Capture") : `Import ${importTarget === 'layer' ? 'Graphic Layer' : 'Base Image'}`}
              </h3>
              <button onClick={() => { setIsCameraActive(false); setIsImportModalOpen(false); }} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors">✕</button>
            </div>
            {!isCameraActive ? (
              <div className="grid grid-cols-2 gap-6">
                <button onClick={() => (importTarget === 'layer' ? layerInputRef : fileInputRef).current?.click()} className="p-12 bg-white/5 rounded-[40px] border border-white/5 flex flex-col items-center gap-6 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group">
                  <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><span className="text-5xl">📁</span></div>
                  <span className="text-lg font-bold">Local File</span>
                </button>
                <button onClick={() => setIsCameraActive(true)} className="p-12 bg-white/5 rounded-[40px] border border-white/5 flex flex-col items-center gap-6 hover:bg-purple-600/10 hover:border-purple-500/30 transition-all group">
                   <div className="w-20 h-20 bg-purple-500/10 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><span className="text-5xl">📷</span></div>
                  <span className="text-lg font-bold">Live Camera</span>
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="relative aspect-video bg-black rounded-[32px] overflow-hidden shadow-2xl border border-white/5">
                  {capturedImage ? <img src={capturedImage} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                      <div className="w-32 h-32 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center border-4 border-white/20 animate-pulse">
                         <span className="text-7xl font-black text-white">{countdown}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-4">
                  {capturedImage ? (
                    <>
                      <button onClick={() => setCapturedImage(null)} className="flex-1 py-5 bg-[#2c2c2e] rounded-2xl font-bold hover:bg-[#3a3a3c] transition-all">Retake</button>
                      <button onClick={confirmCapture} className="flex-1 py-5 bg-blue-600 rounded-2xl font-bold hover:bg-blue-500 transition-all shadow-lg active:scale-95">Accept Frame</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setIsCameraActive(false)} className="flex-1 py-5 bg-[#2c2c2e] rounded-2xl font-bold hover:bg-[#3a3a3c] transition-all">Exit</button>
                      <button onClick={() => startAutoCapture(5)} className="flex-1 py-5 bg-white/5 rounded-2xl border border-white/10 font-bold hover:bg-white/10 transition-all group">
                         <span className="mr-2">⌛</span> 5s Shutter
                      </button>
                      <button onClick={capturePhoto} className="flex-1 py-5 bg-blue-600 rounded-2xl font-bold hover:bg-blue-500 transition-all shadow-lg active:scale-95">Snap Now</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="h-20 border-b border-white/5 bg-[#050505]/90 backdrop-blur-2xl flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={executeStartNewProject}>
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-black text-lg shadow-[0_10px_30px_rgba(59,130,246,0.4)] group-hover:scale-105 transition-transform">T</div>
          <h1 className="text-xl font-extrabold tracking-tight">Thumbio <span className="text-blue-500">Pro</span></h1>
        </div>
        <div className="flex items-center gap-6">
          {currentVersion && (
            <>
              <button onClick={startNewProject} className="px-6 py-2.5 rounded-full text-sm font-bold border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95">New Project</button>
              <button onClick={() => storeCurrentProjectState()} className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all border shadow-lg ${saveIndicator ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10 active:scale-95'}`}>
                {saveIndicator ? 'Changes Saved' : 'Save Project'}
              </button>
              <button onClick={async () => { const final = await composeImage(currentVersion.url, baseLayout, currentVersion.layers); downloadImage(final); }} className="px-8 py-2.5 bg-blue-600 text-white rounded-full text-sm font-black shadow-[0_10px_40px_rgba(37,99,235,0.4)] hover:bg-blue-500 transition-all active:scale-95">Export 16:9</button>
            </>
          )}
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-12 h-12 rounded-2xl border border-white/10 overflow-hidden bg-[#1c1c1e] hover:border-blue-500/50 transition-all active:scale-95">
             <img src={`https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff`} className="w-full h-full" alt="User" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className={`w-48 border-r border-white/5 bg-[#050505]/60 backdrop-blur-md flex flex-col transition-all duration-700 ${!currentVersion ? '-translate-x-48' : ''}`}>
          <div className="p-6 border-b border-white/5 text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">Revision Stack</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
            {history.map((v, i) => (
              <button key={v.id} onClick={() => setCurrentIdx(i)} className={`relative w-full aspect-video rounded-2xl overflow-hidden border-2 transition-all group ${i === currentIdx ? 'border-blue-500 scale-105 shadow-[0_15px_30px_rgba(59,130,246,0.3)]' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-102'}`}>
                <img src={v.url} className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-lg text-[9px] font-black backdrop-blur-md">v{i+1}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative overflow-y-auto scrollbar-hide bg-[radial-gradient(circle_at_50%_50%,_#0a0a0f_0%,_#020617_100%)]">
          {currentVersion ? (
            <div className="flex-1 flex flex-col items-center p-12 space-y-16 max-w-6xl mx-auto w-full">
              <div className="relative w-full aspect-video rounded-[60px] overflow-hidden shadow-[0_100px_200px_rgba(0,0,0,0.8)] border border-white/10 bg-[#000]">
                <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                  <img 
                    src={currentVersion.url} 
                    style={{ transform: `scale(${baseLayout.scale ?? 1}) translate(${baseLayout.translateX ?? 0}%, ${baseLayout.translateY ?? 0}%) scale(${baseLayout.stretchX ?? 1}, ${baseLayout.stretchY ?? 1})` }} 
                    className={`w-full h-full object-contain transition-all duration-300 ${activeLayerId === 'base' ? 'ring-2 ring-blue-500/40 brightness-110' : 'opacity-60 grayscale-[30%]'}`} 
                    onClick={() => setActiveLayerId('base')}
                  />
                  {currentVersion.layers.map(layer => (
                    <img 
                      key={layer.id}
                      src={layer.url} 
                      style={{ 
                        transform: `scale(${layer.layout.scale ?? 1}) translate(${layer.layout.translateX ?? 0}%, ${layer.layout.translateY ?? 0}%) scale(${layer.layout.stretchX ?? 1}, ${layer.layout.stretchY ?? 1})`,
                        position: 'absolute'
                      }} 
                      className={`max-h-[90%] max-w-[90%] object-contain cursor-move transition-all ${activeLayerId === layer.id ? 'ring-[6px] ring-blue-500 drop-shadow-[0_40px_80px_rgba(59,130,246,0.5)] z-20 brightness-110' : 'z-10 hover:ring-2 hover:ring-white/30'}`}
                      onClick={() => setActiveLayerId(layer.id)}
                    />
                  ))}
                </div>
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative">
                       <div className="w-16 h-16 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
                       <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div></div>
                    </div>
                    <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-white/80 animate-pulse">{statusMessage}</p>
                  </div>
                )}
              </div>

              <div className="w-full max-w-4xl space-y-8 animate-in slide-in-from-bottom-10 duration-500">
                 <div className="bg-[#1c1c1e]/60 backdrop-blur-3xl border border-white/10 rounded-[48px] p-10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#a1a1a6]">AI Synthesis Engine</h2>
                    </div>
                    <textarea 
                      value={prompt} 
                      onChange={(e) => setPrompt(e.target.value)} 
                      placeholder="Describe the desired background, lighting, and cinematic style..." 
                      className="w-full bg-transparent border-none focus:ring-0 text-2xl font-semibold h-28 placeholder:text-white/10 resize-none leading-tight" 
                    />
                    <div className="flex justify-between items-center mt-8 pt-8 border-t border-white/5">
                      <button onClick={createSnapshot} className="text-xs font-black text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors">Mark Milestone</button>
                      <button 
                        onClick={() => handleEdit()} 
                        disabled={isProcessing || !prompt.trim()} 
                        className="px-12 py-4 bg-blue-600 hover:bg-blue-500 rounded-3xl font-black text-sm shadow-[0_15px_40px_rgba(37,99,235,0.4)] disabled:opacity-30 transition-all active:scale-95"
                      >
                        Synthesize Layers
                      </button>
                    </div>
                 </div>
              </div>
            </div>
          ) : (
            <div className="p-16 space-y-16 animate-in fade-in zoom-in-95 duration-1000 max-w-6xl mx-auto w-full">
              <div className="flex items-end justify-between">
                <div className="space-y-4">
                  <h2 className="text-8xl font-black tracking-tighter leading-none">Studio<span className="text-blue-600">.</span></h2>
                  <p className="text-2xl text-[#a1a1a6] font-medium max-w-lg">High-performance YouTube thumbnails powered by custom AI workflows.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div onClick={() => openImportModal('base')} className="h-[400px] bg-[#1c1c1e] rounded-[64px] border border-white/5 hover:border-blue-500/40 transition-all cursor-pointer flex flex-col items-center justify-center p-16 group hover:shadow-[0_50px_100px_rgba(0,0,0,0.5)]">
                   <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mb-10 group-hover:scale-110 group-hover:bg-blue-600/20 transition-all"><span className="text-5xl">➕</span></div>
                   <h3 className="text-3xl font-black mb-4 tracking-tight">Import Asset</h3>
                   <p className="text-[#a1a1a6] text-center text-lg">Start with a local image or live camera snap.</p>
                </div>
                <div className="bg-[#1c1c1e] rounded-[64px] border border-white/5 p-16 flex flex-col hover:border-indigo-500/40 transition-all">
                   <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-10">AI Blueprints</h3>
                   <div className="grid grid-cols-2 gap-5 flex-1">
                     {SCRATCH_TEMPLATES.map(t => (
                       <button key={t.label} onClick={() => handleGenerateFromScratch(t.prompt)} className="p-6 bg-white/5 hover:bg-indigo-600/20 rounded-3xl text-left flex items-center gap-4 transition-all group border border-transparent hover:border-indigo-500/30">
                         <span className="text-3xl group-hover:scale-110 transition-transform">{t.icon}</span>
                         <span className="text-xs font-black uppercase tracking-tight leading-none">{t.label}</span>
                       </button>
                     ))}
                   </div>
                </div>
              </div>
              {projects.length > 0 && (
                <div className="pt-16">
                   <h3 className="text-3xl font-black text-white mb-10 tracking-tight">Production Vault</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                      {projects.map(p => (
                        <div key={p.id} onClick={() => loadProject(p)} className="relative group bg-[#1c1c1e] rounded-[48px] overflow-hidden border border-white/5 cursor-pointer hover:scale-[1.03] hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] transition-all duration-300">
                            <img src={p.thumbnailUrl} className="aspect-video w-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500" />
                            <div className="p-8 font-extrabold text-xl truncate pr-20 bg-gradient-to-t from-black/80 to-transparent">{p.name}</div>
                            <button 
                              onClick={(e) => deleteProject(p.id, e)} 
                              className="absolute bottom-6 right-6 p-4 bg-red-600/10 text-red-500 rounded-3xl hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-2xl backdrop-blur-xl border border-red-500/20"
                              title="Delete Project"
                            >
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className={`w-[400px] border-l border-white/5 bg-[#050505]/80 backdrop-blur-3xl flex flex-col transition-all duration-700 ${!currentVersion ? 'translate-x-[400px]' : ''}`}>
          <div className="flex p-2.5 gap-1.5 bg-white/5 m-6 rounded-[24px] h-14 flex-shrink-0">
            {(['styles', 'effects', 'transform', 'chat'] as EditMode[]).map(mode => (
              <button key={mode} onClick={() => setEditMode(mode)} className={`flex-1 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${editMode === mode ? 'bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)]' : 'text-[#a1a1a6] hover:text-white hover:bg-white/5'}`}>{mode}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-8 pb-10 space-y-10 scrollbar-hide">
            {editMode === 'styles' && (
              <div className="grid grid-cols-1 gap-4 pt-4">
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => handleEdit(a.prompt)} className="flex items-center gap-5 p-5 bg-[#1c1c1e] hover:bg-blue-600/10 rounded-[32px] border border-white/5 group transition-all hover:border-blue-500/40">
                    <span className="text-3xl group-hover:scale-125 transition-transform duration-300">{a.icon}</span>
                    <span className="text-sm font-extrabold tracking-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            )}

            {editMode === 'effects' && (
              <div className="grid grid-cols-1 gap-4 pt-4">
                {CINEMATIC_EFFECTS.map(e => (
                  <button key={e.label} onClick={() => handleEdit(e.prompt)} className="flex items-center gap-5 p-5 bg-[#1c1c1e] hover:bg-purple-600/10 rounded-[32px] border border-white/5 group transition-all hover:border-purple-500/40">
                    <span className="text-3xl group-hover:scale-125 transition-transform duration-300">{e.icon}</span>
                    <span className="text-sm font-extrabold tracking-tight">{e.label}</span>
                  </button>
                ))}
              </div>
            )}

            {editMode === 'transform' && (
              <div className="space-y-10 pt-4">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.3em] px-2">Active Layers</h4>
                  <div className="flex flex-col gap-3">
                    <button onClick={() => setActiveLayerId('base')} className={`flex items-center gap-4 p-4 rounded-3xl border transition-all ${activeLayerId === 'base' ? 'bg-blue-600/10 border-blue-500 shadow-xl' : 'bg-white/2 border-white/5 hover:bg-white/5'}`}>
                       <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center"><span className="text-xl">🖼️</span></div>
                       <span className="flex-1 text-left text-sm font-bold">Background Base</span>
                    </button>
                    {currentVersion?.layers.map(layer => (
                      <div key={layer.id} className="relative group">
                        <button onClick={() => setActiveLayerId(layer.id)} className={`w-full flex items-center gap-4 p-4 rounded-3xl border transition-all ${activeLayerId === layer.id ? 'bg-blue-600/10 border-blue-500 shadow-xl' : 'bg-white/2 border-white/5 hover:bg-white/5'}`}>
                           <img src={layer.url} className="w-10 h-10 object-cover rounded-xl border border-white/10" />
                           <span className="flex-1 text-left text-sm font-bold truncate">{layer.name}</span>
                        </button>
                        <button onClick={(e) => removeLayer(layer.id, e)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 bg-red-600/20 text-red-500 rounded-full hover:bg-red-600 hover:text-white transition-all">✕</button>
                      </div>
                    ))}
                    <button onClick={() => openImportModal('layer')} className="flex items-center justify-center gap-3 p-5 mt-4 bg-blue-600/10 border-2 border-dashed border-blue-500/30 rounded-[32px] text-blue-500 hover:bg-blue-600/20 transition-all font-black uppercase text-xs tracking-widest group">
                      <span className="text-2xl group-hover:scale-125 transition-transform">＋</span>
                      Add Image Layer
                    </button>
                  </div>
                </div>

                <div className="space-y-8 p-6 bg-white/5 rounded-[40px] border border-white/5">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">Overall Scale</span><span className="text-blue-500 font-black tabular-nums">{((currentActiveLayout.scale ?? 1) * 100).toFixed(0)}%</span></div>
                    <input type="range" min="0.1" max="3" step="0.05" value={currentActiveLayout.scale ?? 1} onChange={(e) => updateActiveTransform('scale', parseFloat(e.target.value))} className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer" />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">Stretch X</span><span className="text-blue-500 font-black tabular-nums">{((currentActiveLayout.stretchX ?? 1) * 100).toFixed(0)}%</span></div>
                    <input type="range" min="0.1" max="2" step="0.05" value={currentActiveLayout.stretchX ?? 1} onChange={(e) => updateActiveTransform('stretchX', parseFloat(e.target.value))} className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">Stretch Y</span><span className="text-blue-500 font-black tabular-nums">{((currentActiveLayout.stretchY ?? 1) * 100).toFixed(0)}%</span></div>
                    <input type="range" min="0.1" max="2" step="0.05" value={currentActiveLayout.stretchY ?? 1} onChange={(e) => updateActiveTransform('stretchY', parseFloat(e.target.value))} className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer" />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">X Axis</span><span className="text-blue-500 font-black tabular-nums">{currentActiveLayout.translateX ?? 0}%</span></div>
                    <input type="range" min="-100" max="100" step="1" value={currentActiveLayout.translateX ?? 0} onChange={(e) => updateActiveTransform('translateX', parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#a1a1a6] uppercase tracking-[0.2em]">Y Axis</span><span className="text-blue-500 font-black tabular-nums">{currentActiveLayout.translateY ?? 0}%</span></div>
                    <input type="range" min="-100" max="100" step="1" value={currentActiveLayout.translateY ?? 0} onChange={(e) => updateActiveTransform('translateY', parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-blue-500 cursor-pointer" />
                  </div>
                </div>
              </div>
            )}

            {editMode === 'chat' && (
              <div className="flex flex-col h-[70vh]">
                <div className="flex-1 overflow-y-auto space-y-6 mb-6 scrollbar-hide p-2">
                  <div className="bg-blue-600/10 border border-blue-500/20 rounded-[32px] p-6 text-xs leading-relaxed text-blue-400 font-bold shadow-sm">
                    Coach Mode: I'm analyzing your current frame for psychological impact and CTR potential. Ask for advice or specific tweaks.
                  </div>
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] p-5 rounded-[28px] text-sm shadow-xl animate-in slide-in-from-bottom-4 duration-300 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[#1c1c1e] border border-white/10'}`}>{msg.text}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="relative mt-auto">
                  <input 
                    type="text" 
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()} 
                    placeholder="Describe your vision..." 
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded-[28px] px-8 py-5 text-sm font-semibold focus:outline-none focus:border-blue-500/50 transition-all shadow-inner placeholder:text-white/10" 
                  />
                  <button onClick={handleChatSubmit} disabled={!chatInput.trim() || isProcessing} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-blue-600 rounded-2xl text-white shadow-2xl hover:bg-blue-500 disabled:opacity-20 transition-all active:scale-90">➤</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      
      {/* Hidden inputs for file picking */}
      <input type="file" ref={fileInputRef} onChange={handleBaseUpload} className="hidden" accept="image/*" />
      <input type="file" ref={layerInputRef} onChange={handleLayerUpload} className="hidden" accept="image/*" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
