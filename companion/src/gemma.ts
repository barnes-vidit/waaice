import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { loadJSON } from './storage';

interface Settings {
  gemma_model?: string;
  whisper_api_url?: string;
}

function getSettings(): Settings {
  return loadJSON<Settings>('settings.json', {});
}

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY env var is not set');
  return new GoogleGenerativeAI(apiKey);
}

async function callGemma(prompt: string): Promise<string> {
  const settings = getSettings();
  const model = settings.gemma_model || 'gemma-3-27b-it';
  const genAI = getClient();
  const gemma = genAI.getGenerativeModel({ model });
  const result = await gemma.generateContent(prompt);
  return result.response.text().trim();
}

export interface Intent {
  action: 'send' | 'reply' | 'next' | 'skip' | 'repeat' | 'ignore_group' | 'remind_later' | 'tone_change' | 'unknown';
  contact: string | null;
  message: string | null;
  tone: 'casual' | 'formal' | 'short' | 'polite' | null;
}

export async function parseIntent(transcript: string): Promise<Intent> {
  const prompt = `You are an intent parser for a WhatsApp voice assistant.
Extract the intent from the user's speech transcript.
Return ONLY valid JSON, no explanation.

Schema:
{
  "action": "send" | "reply" | "next" | "skip" | "repeat" | "ignore_group" | "remind_later" | "tone_change" | "unknown",
  "contact": string | null,
  "message": string | null,
  "tone": "casual" | "formal" | "short" | "polite" | null
}

Transcript: "${transcript}"`;

  const raw = await callGemma(prompt);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]) as Intent;
  } catch {
    return { action: 'unknown', contact: null, message: null, tone: null };
  }
}

export async function summarizeMessages(messages: Array<{ sender?: string; text: string }>): Promise<string> {
  const formatted = messages.map((m, i) => `${i + 1}. ${m.sender ? `${m.sender}: ` : ''}${m.text}`).join('\n');

  const prompt = `You are summarizing WhatsApp messages for a voice assistant.
Summarize in ONE short sentence, spoken naturally.
Format: "[Name] sent [N] messages — [gist]"
Example: "Rahul sent 3 messages — asking about tonight's plan"

Messages:
${formatted}`;

  return await callGemma(prompt);
}

export async function refineMessage(message: string, tone?: string): Promise<string> {
  const prompt = `You are refining a WhatsApp message spoken by the user.
- Remove filler words (uh, um, like)
- Fix grammar naturally
- Keep it conversational, not robotic
- Apply tone if specified: ${tone ?? 'none'}
- Return ONLY the refined message, nothing else

Original: "${message}"`;

  return await callGemma(prompt);
}

export async function transcribeAudio(filePath: string, language: string): Promise<string> {
  const settings = getSettings();
  const whisperUrl = settings.whisper_api_url || 'http://localhost:9000/asr';

  const form = new FormData();
  form.append('audio_file', fs.createReadStream(filePath));
  form.append('language', language.split('-')[0]);

  const res = await axios.post(whisperUrl, form, {
    headers: form.getHeaders(),
    params: { task: 'transcribe', output: 'txt' },
  });

  fs.unlink(filePath, () => {});
  return typeof res.data === 'string' ? res.data.trim() : res.data?.text?.trim() ?? '';
}
