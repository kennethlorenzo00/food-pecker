import { Persona, PersonaRole } from "../types";
import { getGroq } from "./groqService";

export interface RestaurantData {
  name: string;
  url: string;
  cuisine: string;
  rating: string;
  estimated_delivery_time: string;
  menu: Array<{
    name: string;
    price?: string;
    description?: string;
  }>;
}

export interface ScrapeResult {
  location: { latitude: number; longitude: number };
  total_restaurants: number;
  restaurants: RestaurantData[];
}

export async function selectItemsForPersona(
  persona: Persona,
  data: ScrapeResult
): Promise<string> {
  const groq = getGroq();
  const model = "llama-3.3-70b-versatile";

  const dataString = JSON.stringify(data, null, 2);

  const systemInstruction = `You are ${persona.name}. ${persona.description}.

Your task: Based on your preferences, choose 1-3 specific food items from the provided restaurant data. Each choice should include the restaurant name and exact item name.

Rules:
- Only choose items that match your personality and food preferences.
- Include a soft drink if it fits your description (e.g., "2 pc chicken from 24 Chicken and a bottled coke").
- Output as a JSON array of strings, each being a full choice description.
- Keep choices realistic and based on actual menu items.

Example output: ["2 pc chicken from 24 Chicken and a bottled coke", "Fried chicken from KFC"]`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemInstruction,
      },
      {
        role: "user",
        content: `Here is the scraped restaurant data:\n${dataString}\n\nWhat items would you choose? Respond with JSON array only.`,
      },
    ],
    model,
    temperature: 0.7,
  });

  const response = chatCompletion.choices[0]?.message?.content || "[]";
  try {
    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed as string[] : [];
  } catch {
    return [];
  }
}

export async function loadScrapeData(): Promise<ScrapeResult> {
  const response = await fetch('/grabfood_results.json');
  if (!response.ok) {
    throw new Error('Failed to load scrape data');
  }
  return response.json();
}

export async function processAllPersonas(data: ScrapeResult, personas: Persona[]): Promise<Record<string, string[]>> {
  const results: Record<string, string[]> = {};
  for (const persona of personas) {
    console.log(`Processing ${persona.name}...`);
    results[persona.id] = await selectItemsForPersona(persona, data);
  }
  return results;
}
