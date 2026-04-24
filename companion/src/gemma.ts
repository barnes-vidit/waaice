import { GoogleGenAI } from '@google/genai';
import Groq, { toFile } from 'groq-sdk';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { loadJSON } from './storage';
import { log } from './logger';

interface Settings {
  gemma_model?: string;
  whisper_api_url?: string;
}

function getSettings(): Settings {
  return loadJSON<Settings>('settings.json', {});
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY env var is not set');
  return new GoogleGenAI({ apiKey });
}

interface GemmaConfig {
  maxOutputTokens?: number;
  systemInstruction?: string;
  responseMimeType?: string;
}

async function callGemma(prompt: string, config?: GemmaConfig): Promise<string> {
  const settings = getSettings();
  const model = settings.gemma_model || 'gemma-4-26b-a4b-it';
  log('Gemma', `Calling model: ${model}`);
  const ai = getClient();
  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      maxOutputTokens: config?.maxOutputTokens ?? 1024,
      systemInstruction: config?.systemInstruction,
      responseMimeType: config?.responseMimeType,
      temperature: 0.0, // Keeping low variance for assistant logic
    }
  });
  const text = result.text?.trim() ?? '';
  log('Gemma', `Response (${text.length} chars): ${text.substring(0, 120)}`);
  return text;
}

export interface Intent {
  action: 'send' | 'reply' | 'next' | 'skip' | 'repeat' | 'ignore_group' | 'remind_later' | 'tone_change' | 'confirm' | 'read_full' | 'stop' | 'unknown';
  contact: string | null;
  message: string | null;
  tone: 'casual' | 'formal' | 'short' | 'polite' | null;
}

export async function parseIntent(transcript: string, context: 'compose' | 'command' = 'compose'): Promise<Intent> {
  log('Gemma:intent', `Parsing [${context}]: "${transcript}"`);

  const composeExamples = `
Examples for compose context:
- "message Rahul I'll be late" → {"action":"send","contact":"Rahul","message":"I'll be late","tone":null}
- "tell mom I'm on the way" → {"action":"send","contact":"mom","message":"I'm on the way","tone":null}
- "send a formal message to Priya congratulating her" → {"action":"send","contact":"Priya","message":"Congratulations","tone":"formal"}
- "message the team keep it short just say meeting at 3" → {"action":"send","contact":"team","message":"Meeting at 3","tone":"short"}`;

  const commandExamples = `
Examples for command context (after hearing a WhatsApp message):
- "next" / "next one" / "move on" / "go ahead" / "skip" / "not interested" → {"action":"next"}
- "reply" / "respond" / "I want to reply" → {"action":"reply"}
- "repeat" / "say that again" / "read it again" / "what did they say" → {"action":"repeat"}
- "send" / "yes" / "send it" / "sounds good" / "do it" / "okay go ahead" / "confirm" → {"action":"confirm"}
- "read the full thing" / "read everything" / "expand" / "full message" / "show me all of it" → {"action":"read_full"}
- "remind me later" / "follow up later" / "snooze" → {"action":"remind_later"}
- "ignore this group" / "mute this group" / "stop this group" → {"action":"ignore_group"}
- "stop" / "exit" / "I'm done" / "nevermind" / "cancel" / "go back" → {"action":"stop"}
- "casual" / "make it casual" / "more formal" / "shorter" → {"action":"tone_change","tone":"casual"|"formal"|"short"|"polite"}`;

  const systemInstruction = `You are an intent parser for a voice-controlled WhatsApp assistant.
Context: ${context === 'compose' ? 'User is composing a new message' : 'User just heard a WhatsApp message and is giving a navigation command'}.
Return ONLY valid JSON.

Schema:
{
  "action": "send"|"reply"|"next"|"skip"|"repeat"|"ignore_group"|"remind_later"|"tone_change"|"confirm"|"read_full"|"stop"|"unknown",
  "contact": string|null,
  "message": string|null,
  "tone": "casual"|"formal"|"short"|"polite"|null
}
${context === 'compose' ? composeExamples : commandExamples}`;

  const prompt = `Transcript: "${transcript}"`;

  const raw = await callGemma(prompt, { 
    maxOutputTokens: 250, // Generous limit for intent JSON
    systemInstruction, 
    responseMimeType: 'application/json' 
  });
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const intent = JSON.parse(jsonMatch[0]) as Intent;
    log('Gemma:intent', `Result: action=${intent.action} contact=${intent.contact} message=${intent.message}`);
    return intent;
  } catch {
    log('Gemma:intent', `Failed to parse JSON from response: ${raw}`, 'warn');
    return { action: 'unknown', contact: null, message: null, tone: null };
  }
}

export async function summarizeMessages(messages: Array<{ sender?: string; text: string }>): Promise<string> {
  const senders = [...new Set(messages.map(m => m.sender).filter(Boolean))];
  const isGroupConversation = senders.length > 1;

  const formatted = messages.map((m, i) =>
    `${i + 1}. ${m.sender ? `${m.sender}: ` : ''}${m.text}`
  ).join('\n');

  const systemInstruction = isGroupConversation
    ? `You are summarizing a WhatsApp group conversation for a voice assistant.
Summarize in ONE natural spoken sentence.
Format: "[Group name or topic]: [who said what gist]"
Example: "Work group: Alice shared the meeting link, Bob said he'll be 10 minutes late"`
    : `You are summarizing WhatsApp messages for a voice assistant.
Summarize in ONE short sentence, spoken naturally.
Format: "[Name] sent [N] messages — [gist]"
Example: "Rahul sent 3 messages — asking about tonight's plan"`;

  const prompt = `Messages:\n${formatted}`;

  return await callGemma(prompt, { 
    maxOutputTokens: 250, // Enough for a single spoken sentence
    systemInstruction 
  });
}

export async function refineMessage(message: string, tone?: string): Promise<string> {
  const systemInstruction = `You are refining a WhatsApp message spoken by the user.
- Remove filler words (uh, um, like)
- Fix grammar naturally
- Keep it conversational, not robotic
- Apply tone if specified: ${tone ?? 'none'}
- Return ONLY the refined message text, no quotes, no explanation`;

  const prompt = `Original: "${message}"`;

  const result = await callGemma(prompt, { 
    maxOutputTokens: 600, // Generous enough for very long dictated messages
    systemInstruction 
  });
  // Strip surrounding quotes Gemma sometimes adds
  return result.replace(/^["']|["']$/g, '').trim();
}

export async function transcribeAudio(filePath: string, language: string): Promise<string> {
  log('Whisper', `Transcribing: ${filePath} | lang: ${language}`);

  if (!fs.existsSync(filePath)) {
    log('Whisper', `Audio file not found: ${filePath}`, 'error');
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const groqKey = process.env.GROQ_API_KEY;

  if (groqKey) {
    return transcribeWithGroq(filePath, language, groqKey);
  }

  // ─── Fallback: local Whisper server ────────────────────────────────────────
  const settings = getSettings();
  const whisperUrl = settings.whisper_api_url || 'http://localhost:9000/asr';
  log('Whisper', `GROQ_API_KEY not set — falling back to local Whisper at ${whisperUrl}`, 'warn');

  const form = new FormData();
  form.append('audio_file', fs.createReadStream(filePath));
  form.append('language', language.split('-')[0]);

  try {
    const res = await axios.post(whisperUrl, form, {
      headers: form.getHeaders(),
      params: { task: 'transcribe', output: 'txt' },
      timeout: 30000,
    });
    fs.unlink(filePath, () => {});
    const transcript = typeof res.data === 'string' ? res.data.trim() : res.data?.text?.trim() ?? '';
    log('Whisper', `Transcript (local): "${transcript}"`);
    return transcript;
  } catch (err: any) {
    const msg = err?.code === 'ECONNREFUSED'
      ? `No GROQ_API_KEY set and local Whisper not running at ${whisperUrl}. Add GROQ_API_KEY to companion/.env`
      : err?.message ?? 'Unknown transcription error';
    log('Whisper', msg, 'error');
    throw new Error(msg);
  }
}

async function transcribeWithGroq(filePath: string, language: string, apiKey: string): Promise<string> {
  log('Whisper:groq', `Using Groq whisper-large-v3-turbo | lang: ${language}`);
  const groq = new Groq({ apiKey });

  try {
    const transcription = await groq.audio.transcriptions.create({
      // toFile() attaches an explicit filename + MIME type to the stream.
      // Without it, Groq sees a file with no extension and rejects it.
      file: await toFile(fs.createReadStream(filePath), 'recording.m4a', { type: 'audio/m4a' }),
      model: 'whisper-large-v3-turbo',
      language: language.split('-')[0],   // BCP-47 → ISO 639-1 (e.g. 'en-IN' → 'en')
      response_format: 'json',
      temperature: 0.0,
    });

    fs.unlink(filePath, () => {});
    const transcript = transcription.text?.trim() ?? '';
    log('Whisper:groq', `Transcript: "${transcript}"`);
    return transcript;
  } catch (err: any) {
    const msg = err?.error?.message ?? err?.message ?? 'Groq transcription failed';
    log('Whisper:groq', `Error: ${msg}`, 'error');
    throw new Error(`Groq Whisper error: ${msg}`);
  }
}
