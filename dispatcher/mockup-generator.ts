#!/usr/bin/env tsx
/**
 * MCM Forge Mockup Generator
 *
 * Uses Google's Nano Banana 2 (gemini-3.1-flash-image-preview)
 * to generate UI mockup images from:
 * - Current app screenshots
 * - Reference images (competitors, design inspiration)
 * - Text prompts describing desired changes
 *
 * Cost: ~$0.067/image at 1K resolution
 */

import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// ============================================
// Types
// ============================================

interface MockupParams {
  prompt: string;
  currentScreenshot?: Buffer;
  referenceImages?: Buffer[];
  aspectRatio?: "16:9" | "4:3" | "1:1";
  resolution?: "1K" | "2K";
}

interface MockupResult {
  imageBuffer: Buffer;
  imageUrl: string;
}

// ============================================
// Configuration
// ============================================

const GEMINI_MODEL = "gemini-3.1-flash-image-preview";

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }
  return new GoogleGenAI({ apiKey });
}

function getStorageClient() {
  const url = process.env.MCMFORGE_SUPABASE_URL;
  const key = process.env.MCMFORGE_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ============================================
// Mockup Generation
// ============================================

export async function generateMockup(params: MockupParams): Promise<MockupResult> {
  const {
    prompt,
    currentScreenshot,
    referenceImages = [],
    aspectRatio = "16:9",
    resolution = "1K",
  } = params;

  const ai = getGenAI();

  // Build content parts: text prompt + images
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // System instruction as first text part
  parts.push({
    text: `You are a UI/UX designer creating a realistic mockup for a web application.
Generate a high-fidelity UI mockup image based on the following requirements.
Make it look like a real web application screenshot — clean, modern, professional.
Use proper layout, real-looking text (not lorem ipsum), and consistent styling.
Aspect ratio: ${aspectRatio}. Resolution: ${resolution}.

Requirements:
${prompt}`,
  });

  // Add current screenshot if provided
  if (currentScreenshot) {
    parts.push({ text: "Current app screenshot (modify this):" });
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: currentScreenshot.toString("base64"),
      },
    });
  }

  // Add reference images if provided
  for (let i = 0; i < referenceImages.length; i++) {
    parts.push({ text: `Reference image ${i + 1} (use as design inspiration):` });
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: referenceImages[i].toString("base64"),
      },
    });
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["image", "text"],
    },
  });

  // Extract generated image from response
  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("Nano Banana 2 did not return an image. Response: " +
      JSON.stringify(response.candidates?.[0]?.content?.parts?.map(
        (p: { text?: string }) => p.text
      ).filter(Boolean)));
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");

  // Upload to Supabase storage
  const imageUrl = await uploadMockup(imageBuffer);

  return { imageBuffer, imageUrl };
}

// ============================================
// Upload to Supabase Storage
// ============================================

async function uploadMockup(buffer: Buffer): Promise<string> {
  const supabase = getStorageClient();
  if (!supabase) {
    throw new Error("Missing Supabase credentials for mockup upload");
  }

  const fileName = `mockups/mockup-${Date.now()}.png`;

  const { error } = await supabase.storage
    .from("artifacts")
    .upload(fileName, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload mockup: ${error.message}`);
  }

  const { data } = supabase.storage.from("artifacts").getPublicUrl(fileName);
  return data.publicUrl;
}

// ============================================
// Download Reference Images
// ============================================

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
