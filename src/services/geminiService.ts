import { GoogleGenAI } from "@google/genai";
import { Message, Persona, PersonaRole } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function generatePersonaResponse(
  persona: Persona,
  history: Message[],
  otherPersonas: Persona[]
): Promise<string> {
  const ai = getAI();
  const model = "gemini-3-flash-preview";

  const historyString = history
    .map((m) => `${m.name}: ${m.content}`)
    .join("\n");

  const otherPersonasString = otherPersonas
    .map((p) => `- ${p.name}: ${p.description}`)
    .join("\n");

  const systemInstruction = `
    You are ${persona.name}. 
    Your personality: ${persona.description}.
    
    The current conversation is about "what to eat today".
    Other characters in the conversation:
    ${otherPersonasString}
    
    Current conversation history:
    ${historyString}
    
    Your task:
    1. Respond as ${persona.name} strictly based on your personality and preferences.
    2. If your description implies a casual or roasting personality, feel free to roast others' choices with humor and wit.
    3. If your description mentions "Conyo", "BGC", or "Tagalog", use "Tagalog-Conyo" (mixing English and Tagalog naturally, e.g., "Wait, like, it's so expensive naman there!"). Otherwise, stick to the language implied by your description.
    4. Keep your response concise (1-3 sentences).
    5. Do not prefix your response with your name.
    6. If you are the Mediator, your role is to make a FINAL DECISION. You MUST choose one of the EXACT food items suggested by the debaters in the conversation history. Do not "upgrade" or change the suggestion (e.g., if someone says "steak", don't say "Tomahawk steak"). Pick a winner from the literal suggestions provided. Be sassy and authoritative in your judgment.
    7. If you are a Persona, be opinionated and stick to your character.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: "What is your response to the current discussion?",
    config: {
      systemInstruction,
    },
  });

  return response.text || "I'm not sure what to say.";
}

export async function generatePersonaDraft(
  chatHistory: { role: "user" | "model"; text: string }[]
): Promise<{ 
  nextQuestion?: string; 
  draft?: Partial<Persona>;
  isComplete: boolean;
}> {
  const ai = getAI();
  const model = "gemini-3-flash-preview";

  const systemInstruction = `
    You are the "Persona Architect". Your goal is to help the user create a unique AI persona for a food debate app.
    
    Current state: You are in a conversation with the user to gather details for a new persona.
    
    Required details for a persona:
    1. Name (e.g., "Pizza Pete")
    2. Avatar (a single emoji)
    3. Description (a detailed personality and food preference summary)
    
    Guidelines:
    - Ask one question at a time.
    - Be creative and encouraging.
    - If you have enough information to form a complete persona (Name, Avatar, Description), set "isComplete" to true and provide the "draft" object.
    - Otherwise, set "isComplete" to false and provide the "nextQuestion".
    
    Response format: You MUST return a JSON object with the following structure:
    {
      "nextQuestion": "string (the next question to ask the user)",
      "draft": {
        "name": "string",
        "avatar": "string",
        "description": "string"
      },
      "isComplete": boolean
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: chatHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse persona draft response", e);
    return { nextQuestion: "I'm sorry, I had trouble processing that. Can you tell me more about the persona's name?", isComplete: false };
  }
}
