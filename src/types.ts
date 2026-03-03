export enum PersonaRole {
  USER = "user",
  AI_PERSONA = "ai_persona",
  MEDIATOR = "mediator",
}

export interface Message {
  id: string;
  role: PersonaRole;
  name: string;
  content: string;
  timestamp: number;
}

export interface Persona {
  id: string;
  name: string;
  role: PersonaRole;
  description: string;
  avatar: string;
  color: string;
}
