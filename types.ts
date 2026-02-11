
export interface Layout {
  scale: number;
  stretchX: number;
  stretchY: number;
  translateX: number;
  translateY: number;
}

export interface Layer {
  id: string;
  url: string;
  layout: Layout;
  name: string;
}

export interface ThumbnailVersion {
  id: string;
  url: string; // The base background image
  layers: Layer[];
  baseLayout: Layout; // Persist background transform per version
  prompt?: string;
  timestamp: number;
}

export interface QuickAction {
  label: string;
  icon: string;
  prompt: string;
}

export type EditMode = 'styles' | 'effects' | 'transform' | 'chat';

export interface Project {
  id: string;
  name: string;
  thumbnailUrl: string;
  timestamp: number;
  revisionStack: ThumbnailVersion[];
  snapshots?: ThumbnailVersion[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
