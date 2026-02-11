
import { QuickAction } from './types';

export const QUICK_ACTIONS: QuickAction[] = [
  { 
    label: 'Remove BG (Black)', 
    icon: '✂️', 
    prompt: 'Completely remove the original background. Place the subject against a solid, deep plain black background. Maintain perfect edges on the subject and apply professional studio rim lighting.' 
  },
  { 
    label: 'MrBeast Style', 
    icon: '⚡', 
    prompt: 'Hyper-vibrant colors, extremely high saturation, super bright lighting. Add a subtle glow around the subject. High-contrast YouTube clickbait style.' 
  },
  { 
    label: 'Deep Space', 
    icon: '🚀', 
    prompt: 'Place the subject in a cinematic outer space nebula. Vibrant purples, blues, and glowing stars. Add rim lighting on the subject to match the environment.' 
  },
  { 
    label: 'Gaming Legend', 
    icon: '🎮', 
    prompt: 'Background: High-end gaming setup with heavy purple and teal RGB lighting. Dark environment, cinematic bokeh, sharp details on the subject.' 
  },
  { 
    label: 'Epic Fire', 
    icon: '🔥', 
    prompt: 'Cinematic explosion in the background. Intense orange and red fire lighting. Dramatic action movie aesthetic with warm highlights on the subject.' 
  },
  { 
    label: 'Skin Polish', 
    icon: '✨', 
    prompt: 'Professional retouching. Smooth skin while keeping texture, brighten eyes, enhance facial clarity, and apply studio-grade color grading.' 
  },
  { 
    label: 'Cyberpunk', 
    icon: '🏙️', 
    prompt: 'Neon-lit futuristic city background at night. Rainy atmosphere, teal and orange color palette, cinematic lens flares.' 
  },
  { 
    label: 'Wealth & Luxury', 
    icon: '💰', 
    prompt: 'Luxury aesthetic. Background of a private jet or high-end penthouse. Warm golden lighting, professional lifestyle vlog style.' 
  },
  { 
    label: 'Mystery Fog', 
    icon: '🌫️', 
    prompt: 'Deep moody forest with heavy fog. Cold blue tones, silhouette lighting, high-contrast atmospheric depth.' 
  },
  { 
    label: 'Manga / Anime', 
    icon: '💥', 
    prompt: 'Convert the scene into high-quality anime art style. Dynamic speed lines in the background, cel-shaded lighting, bold outlines.' 
  },
  { 
    label: 'Tropical Vlog', 
    icon: '🏝️', 
    prompt: 'Bright tropical beach background. Crystal clear water, palm trees, sunny HDR look, vibrant summer colors.' 
  },
  { 
    label: 'Gritty Fitness', 
    icon: '🏋️', 
    prompt: 'Industrial gym background. High contrast, sweaty texture, dramatic overhead spotlights, desaturated cinematic "grit" look.' 
  }
];

export const CINEMATIC_EFFECTS: QuickAction[] = [
  {
    label: 'Volumetric Rays',
    icon: '🪄',
    prompt: 'Add dramatic volumetric lighting and god rays cutting through the scene. Enhance atmospheric haze and light scattering.'
  },
  {
    label: 'Anamorphic Flare',
    icon: '📸',
    prompt: 'Apply high-end anamorphic lens flares and horizontal blue light streaks. Professional cinematic film aesthetic.'
  },
  {
    label: 'Neon Rim Light',
    icon: '💡',
    prompt: 'Add an intense neon rim light glow around the subject edges. Use a vibrant color like electric blue or hot pink to separate the subject from the background.'
  },
  {
    label: 'Golden Hour',
    icon: '🌅',
    prompt: 'Apply warm, golden hour lighting. Soft sunlight highlights, long shadows, and a majestic sunset glow across the entire composition.'
  },
  {
    label: 'Cyber Glow',
    icon: '🔮',
    prompt: 'Add glowing holographic particles and digital light artifacts around the subject. Futuristic cybernetic energy effects.'
  },
  {
    label: 'Edge Highlight',
    icon: '✨',
    prompt: 'Sharpen and brighten all edges. Add a subtle white rim light to create a high-end 3D pop effect for the subject.'
  }
];

export const SCRATCH_TEMPLATES = [
  { label: 'Versus Battle', icon: '🆚', prompt: 'A split-screen versus battle background with red energy on the left and blue energy on the right, high action, cinematic.' },
  { label: 'Mystery Box', icon: '📦', prompt: 'A dark, atmospheric scene with a single glowing mysterious package in the center, volumetric lighting, particles.' },
  { label: 'News Alert', icon: '🚨', prompt: 'Breaking news style background with red digital maps, warning stripes, and modern media broadcast overlays.' },
  { label: 'Abstract Flow', icon: '🌈', prompt: 'Vibrant 3D abstract fluid shapes with glowing edges, high energy, professional graphic design aesthetic.' },
];

export const APP_NAME = "ThumbAI Pro";

// Define the maximum number of milestone snapshots to keep per project
export const MAX_SNAPSHOTS = 12;
