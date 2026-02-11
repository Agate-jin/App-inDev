
import { Layout, Layer } from '../types';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const downloadImage = (dataUrl: string, filename: string = 'thumbnail.png') => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

/**
 * Renders base image and multiple layers to a 16:9 canvas with independent transformations.
 */
export const composeImage = async (imageUrl: string, baseLayout: Layout, layers: Layer[]): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Failed to get canvas context");

  // YouTube Standard 16:9
  canvas.width = 1280;
  canvas.height = 720;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. Draw Background/Base
  const baseImg = await loadImage(imageUrl);
  
  const drawWithLayout = (img: HTMLImageElement, layout: Layout) => {
    const targetW = img.width * layout.scale * layout.stretchX;
    const targetH = img.height * layout.scale * layout.stretchY;
    const x = (canvas.width - targetW) / 2 + (layout.translateX * canvas.width / 100);
    const y = (canvas.height - targetH) / 2 + (layout.translateY * canvas.height / 100);
    ctx.drawImage(img, x, y, targetW, targetH);
  };

  drawWithLayout(baseImg, baseLayout);

  // 2. Draw Layers in Order
  for (const layer of layers) {
    try {
      const layerImg = await loadImage(layer.url);
      drawWithLayout(layerImg, layer.layout);
    } catch (e) {
      console.warn("Failed to load layer", layer.id);
    }
  }

  return canvas.toDataURL('image/png');
};
