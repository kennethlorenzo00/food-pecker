import Groq from "groq-sdk";
import { Message, Persona, PersonaRole } from "../types";

let groqInstance: Groq | null = null;

function getGroq() {
  if (!groqInstance) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("VITE_GROQ_API_KEY is not set");
    }
    groqInstance = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  }
  return groqInstance;
}

async function extractFoodSuggestions(history: Message[]): Promise<string[]> {
  const groq = getGroq();
  const model = "llama-3.3-70b-versatile";
  
  // Get only AI persona messages (debaters)
  const debaterMessages = history
    .filter(m => m.role === PersonaRole.AI_PERSONA)
    .map(m => `${m.name}: ${m.content}`)
    .join('\n');

  const systemInstruction = `You are a food extraction specialist. Your task is to extract the specific food items mentioned in debater messages.

Rules:
- Extract ONLY the main food dish being suggested
- Do not include descriptions, opinions, or extra words
- Return as a JSON array of food items
- If no clear food item is found, use "unknown"

Example:
Input: "We should go for grilled salmon with quinoa"
Output: ["grilled salmon with quinoa"]

Input: "Let's get some creamy mac and cheese"
Output: ["creamy mac and cheese"]`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content: `Extract food items from these debater messages:\n${debaterMessages}\n\nReturn as JSON array only.`,
        },
      ],
      model,
      temperature: 0.1,
    });

    const response = chatCompletion.choices[0]?.message?.content || "[]";
    const suggestions = JSON.parse(response);
    console.log('AI extracted food suggestions:', suggestions);
    return Array.isArray(suggestions) ? suggestions.filter(s => s && s !== "unknown") : [];
  } catch (error) {
    console.error('Error extracting food suggestions:', error);
    return [];
  }
}

export async function generatePersonaResponse(
  persona: Persona,
  history: Message[],
  otherPersonas: Persona[]
): Promise<string> {
  const groq = getGroq();
  const model = "llama-3.3-70b-versatile";

  const historyString = history
    .map((m) => `${m.name}: ${m.content}`)
    .join("\n");

  const otherPersonasString = otherPersonas
    .map((p) => `- ${p.name}: ${p.description}`)
    .join("\n");

  // Extract food suggestions from debaters for mediator using AI
  const debaterSuggestions = await extractFoodSuggestions(history);

  const systemInstruction = `
You are ${persona.name}. 
Your personality: ${persona.description}.

The current conversation is about "what to eat today".
Other characters in the conversation:
${otherPersonasString}

Current conversation history:
${historyString}

${persona.role === PersonaRole.MEDIATOR ? `
MEDIATOR RULES - CRITICAL:
- You MUST choose ONE food item from these exact suggestions: ${debaterSuggestions.join(', ')}
- DO NOT suggest your own food item that wasn't mentioned by debaters
- DO NOT upgrade or modify the suggestions 
- Pick ONE winner from the list above
- Be authoritative in your decision

Examples of good mediator responses:
- "The winner is [exact food from list]. It's sophisticated and satisfying."
- "I choose [exact food from list]. Perfect crispy texture and flavor."
` : `
DEBATER RULES:
- Suggest a SPECIFIC food dish that matches your personality description
- Keep your response concise (1-2 sentences)
- Be opinionated and stick to your character
- Do not prefix your response with your name

Examples based on personalities:
- Health-focused: "Grilled chicken salad is perfect - clean, lean, and full of nutrients!"
- Comfort food lover: "Mac and cheese is the ultimate comfort food - creamy, cheesy, and satisfying!"
- Spice addict: "Spicy chicken wings with hot sauce - anything less is boring!"
- Sweet tooth: "Chocolate lava cake for the main course - life's too short for savory!"
- Conyo foodie: "Truffle pasta is the only choice, like, it's so fancy naman!"
`}

Based on your description "${persona.description}", ${persona.role === PersonaRole.MEDIATOR ? 'which food item from the suggestions do you choose?' : 'what specific food would you suggest?'}
`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemInstruction,
      },
      {
        role: "user",
        content: persona.role === PersonaRole.MEDIATOR 
          ? "Choose one food item from the debaters' suggestions and make your final decision."
          : "What specific food should we eat today? Give your suggestion based on your personality.",
      },
    ],
    model,
    temperature: 0.8,
  });

  return chatCompletion.choices[0]?.message?.content || "I'm not sure what to suggest.";
}

export async function generatePersonaDraft(
  chatHistory: { role: "user" | "model"; text: string }[]
): Promise<{ 
  nextQuestion?: string; 
  draft?: Partial<Persona>;
  isComplete: boolean;
}> {
  const groq = getGroq();
  const model = "llama-3.3-70b-versatile";

  const systemInstruction = `You are the "Persona Architect". Your goal is to help the user create a unique AI persona for a food debate app.

Required details for a persona:
1. Name (e.g., "Pizza Pete")
2. Avatar (a single emoji)
3. Description (a detailed personality and food preference summary)

Enhanced conversation flow for rich persona development:
- Start by asking for the persona's name
- Ask about their food preferences (favorite/least favorite foods)
- Ask about their personality/characteristics (jolly, strict, funny, etc.)
- Ask about their speaking style (Taglish-Conyo, formal, casual, etc.)
- Ask about their background/profession (chef, food critic, student, etc.)
- Ask about their food philosophy or beliefs
- Ask for a unique quirk or habit
- Finally ask for an avatar emoji
- If you have enough information, provide the complete persona

Guidelines:
- Ask one question at a time
- Be creative and encouraging
- Track what information you already have
- Build upon previous answers to create deeper questions
- If you have all required details (Name, Avatar, Description), set "isComplete" to true
- If the persona is already complete but the user provides more information, update the draft and keep isComplete as true
- If the user wants to modify existing details, update the draft accordingly

You must respond with ONLY a JSON object. No conversational text before or after the JSON.

Response format:
{
  "nextQuestion": "string (the next question to ask the user, or null if persona is complete)",
  "draft": {
    "name": "string",
    "avatar": "string", 
    "description": "string"
  },
  "isComplete": boolean
}`;

  const messages = [
    {
      role: "user" as const,
      content: `${systemInstruction}\n\nConversation history:\n${chatHistory.map(m => `${m.role}: ${m.text}`).join('\n')}\n\nNow provide your response as JSON only.`
    },
  ];

  const chatCompletion = await groq.chat.completions.create({
    messages,
    model,
    temperature: 0.7,
  });

  try {
    const content = chatCompletion.choices[0]?.message?.content || "{}";
    console.log("Groq API Response:", content);
    
    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    console.error("Failed to parse persona draft response", e);
    console.log("Raw response:", chatCompletion.choices[0]?.message?.content);
    return { nextQuestion: "I'm sorry, I had trouble processing that. Let's start over - what would you like to name this persona?", isComplete: false };
  }
}
