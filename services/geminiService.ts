
import { GoogleGenAI } from "@google/genai";

/**
 * Edits an existing image based on a prompt using gemini-2.5-flash-image.
 * Optimized specifically for YouTube Thumbnails.
 */
export const editImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = 'image/png'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // YouTube Optimization: Heavy focus on subject isolation and environment synthesis
  const enhancedPrompt = `
    INSTRUCTIONS: You are a professional thumbnail editor. Modify the attached image.
    EDIT REQUEST: ${prompt}.
    
    STRICT THUMBNAIL RULES:
    1. SUBJECT PRESERVATION: Keep the identity and composition of the primary person/object perfectly intact.
    2. BACKGROUND REMOVAL: If the request is to remove, clear, or replace the background, you MUST use a solid, deep, plain #000000 (pure black) color as the absolute starting background. 
    3. EDGE QUALITY: When isolating subjects, ensure edges are crisp, clean, and free of artifacts.
    4. CTR BOOST: Use professional rim lighting, high contrast, and vibrant "popping" colors.
    5. COMPOSITION: Output must maintain a 16:9 aspect ratio.
    6. CLARITY: Enhance facial details and primary subject sharpness for readability at small sizes.
  `.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image.split(',')[1] || base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: enhancedPrompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error("The AI engine failed to return a result.");

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image data found. The generation might have been filtered or failed.");
};

/**
 * Generates a starting thumbnail background from scratch.
 */
export const generateNewImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const enhancedPrompt = `
    A professional 16:9 YouTube thumbnail background: ${prompt}. 
    Style: Epic cinematic, high-end production value, vibrant lighting, no text, clean composition. 
    Design for high CTR.
  `.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: enhancedPrompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error("Background generation failed.");

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate background.");
};
