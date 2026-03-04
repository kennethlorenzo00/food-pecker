import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Play, RefreshCw, User, ChefHat, MessageSquare, Sparkles, Settings, Plus, Trash2, X, Check, Edit2, Wand2, Bot } from "lucide-react";
import { Message, Persona, PersonaRole } from "./types";
import { PERSONAS as INITIAL_PERSONAS } from "./constants";
import { generatePersonaResponse, generatePersonaDraft } from "./services/groqService";
import { savePersonaToFirestore, loadPersonasFromFirestore, updatePersonaInFirestore, deletePersonaFromFirestore } from "./services/firebaseService";

export default function App() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  
  // Agentic Creator State
  const [isAgenticCreatorOpen, setIsAgenticCreatorOpen] = useState(false);
  const [agenticMessages, setAgenticMessages] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [agenticInput, setAgenticInput] = useState("");
  const [isAgenticThinking, setIsAgenticThinking] = useState(false);
  const [draftPersona, setDraftPersona] = useState<Partial<Persona> | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agenticEndRef = useRef<HTMLDivElement>(null);

  // Load personas ONLY from Firestore - no localStorage fallback
  useEffect(() => {
    const loadPersonas = async () => {
      try {
        console.log('🔄 Loading personas from Firestore only...');
        const cloudPersonas = await loadPersonasFromFirestore();
        setPersonas(cloudPersonas);
        console.log('✅ Loaded personas from Firestore:', cloudPersonas.length);
      } catch (error) {
        console.error('❌ Failed to load personas from Firestore:', error);
        // No fallback - app will have empty personas if Firestore fails
        setPersonas([]);
      } finally {
        setIsLoaded(true);
      }
    };

    if (!isLoaded) {
      loadPersonas();
    }
  }, [isLoaded]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    agenticEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agenticMessages]);

  const addMessage = (role: PersonaRole, name: string, content: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role,
      name,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    addMessage(PersonaRole.USER, "Admin", inputText);
    setInputText("");
  };

  const triggerAiTurn = async (personaId: string) => {
    const persona = personas.find((p) => p.id === personaId);
    if (!persona) return;

    setIsThinking(true);
    setActivePersonaId(personaId);

    try {
      const otherPersonas = personas.filter((p) => p.id !== personaId);
      const response = await generatePersonaResponse(persona, messages, otherPersonas);
      addMessage(persona.role, persona.name, response);
    } catch (error) {
      console.error("Error generating AI response:", error);
      addMessage(PersonaRole.MEDIATOR, "System", "The AI had trouble responding. Please try again.");
    } finally {
      setIsThinking(false);
      setActivePersonaId(null);
    }
  };

  const startDebate = async () => {
    if (messages.length === 0) {
      addMessage(PersonaRole.USER, "Admin", "What should we eat for dinner today?");
    }
    
    const aiPersonas = personas.filter(p => p.role === PersonaRole.AI_PERSONA);
    for (const persona of aiPersonas) {
      await triggerAiTurn(persona.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const mediator = personas.find(p => p.role === PersonaRole.MEDIATOR);
    if (mediator) {
      await triggerAiTurn(mediator.id);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const savePersona = async (persona: Persona) => {
    try {
      console.log('💾 Saving persona:', persona.name);
      if (personas.find(p => p.id === persona.id)) {
        // Update existing persona
        setPersonas(personas.map(p => p.id === persona.id ? persona : p));
        console.log('✅ Updated existing persona locally');
      } else {
        // New persona - save to Firestore first
        console.log('📤 Saving new persona to Firestore...');
        const docId = await savePersonaToFirestore(persona);
        // Add to local personas with the new Firestore ID
        const newPersona = { ...persona, id: docId };
        setPersonas([...personas, newPersona]);
        console.log('🎉 New persona saved to Firestore with ID:', docId);
      }
    } catch (error) {
      console.error('❌ Error saving persona:', error);
      // Fallback: save locally only
      if (!personas.find(p => p.id === persona.id)) {
        setPersonas([...personas, persona]);
        console.log('⚠️ Saved locally only (Firestore failed)');
      } else {
        setPersonas(personas.map(p => p.id === persona.id ? persona : p));
        console.log('⚠️ Updated locally only (Firestore failed)');
      }
    }

    setEditingPersona(null);
    setDraftPersona(null);
    setIsAgenticCreatorOpen(false);
  };

  const deletePersona = (id: string) => {
    setPersonas(personas.filter(p => p.id !== id));
  };

  const resetPersonas = () => {
    if (confirm("Reset to default personas? This will delete your custom ones.")) {
      setPersonas(INITIAL_PERSONAS);
    }
  };

  // Agentic Creator Logic
  const startAgenticCreator = async () => {
    setIsAgenticCreatorOpen(true);
    setAgenticMessages([]);
    setDraftPersona(null);
    setIsAgenticThinking(true);
    
    try {
      const result = await generatePersonaDraft([{ role: "user", text: "Hello! I want to create a new persona." }]);
      if (result.nextQuestion) {
        setAgenticMessages([{ role: "model", text: result.nextQuestion }]);
      }
    } catch (error) {
      console.error("Error starting agentic creator:", error);
    } finally {
      setIsAgenticThinking(false);
    }
  };

  const handleAgenticSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agenticInput.trim() || isAgenticThinking) return;

    const newUserMessage = { role: "user" as const, text: agenticInput };
    const newHistory = [...agenticMessages, newUserMessage];
    setAgenticMessages(newHistory);
    setAgenticInput("");
    setIsAgenticThinking(true);

    try {
      const result = await generatePersonaDraft(newHistory);
      if (result.draft) {
        setDraftPersona(result.draft);
      }
      if (result.nextQuestion) {
        setAgenticMessages([...newHistory, { role: "model", text: result.nextQuestion }]);
      }
      if (result.isComplete && result.draft) {
        // Add a message indicating the persona can still be modified
        if (!agenticMessages.some(msg => msg.text.includes("You can continue adding details"))) {
          setAgenticMessages(prev => [...prev, { 
            role: "model", 
            text: "Great! Your persona is complete, but you can continue adding more details or modifications. What else would you like to add or change?" 
          }]);
        }
      }
    } catch (error) {
      console.error("Error in agentic creator:", error);
    } finally {
      setIsAgenticThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink font-sans selection:bg-accent/20">
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-slate-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-white shadow-lg shadow-ink/10 transition-transform duration-500">
              <img src="/woodpecker-icon.svg" alt="FoodPecker" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-ink leading-tight">FoodPecker</h1>
              <p className="text-[9px] text-ink/40 font-bold uppercase tracking-[0.15em]">The Food Debate App</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsEditorOpen(true)}
              className="p-2 hover:bg-ink/5 rounded-lg transition-all text-ink/60 hover:text-ink"
              title="Manage Personas"
            >
              <Settings size={18} />
            </button>
            <button 
              onClick={clearChat}
              className="p-2 hover:bg-ink/5 rounded-lg transition-all text-ink/60 hover:text-ink"
              title="Clear Chat"
            >
              <RefreshCw size={18} />
            </button>
            <button 
              onClick={startDebate}
              disabled={isThinking}
              className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-ink/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-95"
            >
              <Play size={14} fill="currentColor" />
              <span>{messages.length === 0 ? "Start" : "Continue"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 p-4 h-[calc(100vh-72px)]">
        {/* Chat Area */}
        <div className="flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30"
                >
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <MessageSquare size={32} strokeWidth={1.5} />
                  </div>
                  <p className="max-w-xs text-sm font-medium">The table is set. Click "Start" to let the AI personas discuss what to eat.</p>
                </motion.div>
              ) : (
                messages.map((msg) => {
                  const persona = personas.find(p => p.name === msg.name);
                  const isUser = msg.role === PersonaRole.USER;
                  const isMediator = msg.role === PersonaRole.MEDIATOR;
                  
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border border-slate-100 shadow-sm transition-transform hover:scale-105 ${persona?.color || "bg-slate-50"}`}>
                        {persona?.avatar || (isUser ? "👤" : "🤖")}
                      </div>
                      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%]`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{msg.name}</span>
                          <span className="text-[8px] font-mono text-slate-300">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isUser 
                            ? "bg-ink text-white rounded-tr-none" 
                            : isMediator 
                              ? "bg-accent/5 text-accent border border-accent/10 rounded-tl-none font-medium italic" 
                              : "bg-muted text-ink rounded-tl-none border border-slate-100"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
            {isThinking && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 animate-pulse bg-slate-50 border border-slate-100`}>
                  {personas.find(p => p.id === activePersonaId)?.avatar || "🤔"}
                </div>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      {personas.find(p => p.id === activePersonaId)?.name || "Thinking"}...
                    </span>
                  </div>
                  <div className="px-4 py-2.5 rounded-2xl bg-muted rounded-tl-none border border-slate-100 flex gap-1">
                    <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Suggest something..."
              className="flex-1 bg-muted border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent/10 transition-all outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isThinking}
              className="w-12 h-12 bg-ink text-white rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 shadow-md"
            >
              <Send size={18} />
            </button>
          </form>
        </div>

        {/* Sidebar - Personas */}
        <div className="hidden lg:flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2">
                <Sparkles size={12} className="text-accent" />
                The Debaters
              </h2>
              <div className="flex items-center gap-1">
                <button 
                  onClick={startAgenticCreator}
                  className="p-1.5 hover:bg-accent/10 rounded-lg transition-all text-accent group"
                  title="Create with AI"
                >
                  <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                </button>
                <button 
                  onClick={() => setIsEditorOpen(true)}
                  className="p-1.5 hover:bg-ink/5 rounded-lg transition-all text-ink/40 hover:text-ink"
                  title="Manual Add"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {personas.filter(p => p.role === PersonaRole.AI_PERSONA).map((persona) => (
                <motion.div 
                  key={persona.id} 
                  whileHover={{ x: 2 }}
                  className="group cursor-pointer" 
                  onClick={() => !isThinking && triggerAiTurn(persona.id)}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border border-slate-100 shadow-sm ${persona.color} group-hover:scale-105 transition-all`}>
                      {persona.avatar}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold group-hover:text-accent transition-colors">{persona.name}</span>
                      {activePersonaId === persona.id && (
                        <span className="text-[8px] font-bold text-accent animate-pulse uppercase tracking-widest">Speaking...</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed pl-11 font-medium line-clamp-2">
                    {persona.description}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2 mb-4">
                <Bot size={12} className="text-accent" />
                The Mediator
              </h2>
              {personas.filter(p => p.role === PersonaRole.MEDIATOR).map((persona) => (
                <motion.div 
                  key={persona.id} 
                  whileHover={{ x: 2 }}
                  className="group cursor-pointer" 
                  onClick={() => !isThinking && triggerAiTurn(persona.id)}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border border-slate-100 shadow-sm ${persona.color} group-hover:scale-105 transition-all`}>
                      {persona.avatar}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold group-hover:text-accent transition-colors">{persona.name}</span>
                      {activePersonaId === persona.id && (
                        <span className="text-[8px] font-bold text-accent animate-pulse uppercase tracking-widest">Speaking...</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed pl-11 font-medium">
                    {persona.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="bg-ink p-6 rounded-2xl text-white shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12 blur-xl group-hover:bg-white/10 transition-all duration-700"></div>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2 relative z-10">
              <ChefHat size={18} className="text-accent" />
              Admin
            </h3>
            <p className="text-[10px] text-white/50 leading-relaxed mb-4 relative z-10 font-medium">
              Influence the debate by typing. Click a persona to force their turn.
            </p>
            <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-accent/80 bg-accent/10 px-2 py-1 rounded-full inline-block relative z-10">
              {isThinking ? "Thinking..." : "Ready"}
            </div>
          </div>
        </div>
      </main>

      {/* Agentic Persona Creator Modal */}
      <AnimatePresence>
        {isAgenticCreatorOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAgenticCreatorOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[70vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
                    <Wand2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Persona Architect</h2>
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-accent/60">AI-Powered Creation</p>
                  </div>
                </div>
                <button onClick={() => setIsAgenticCreatorOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-all text-slate-400"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide bg-slate-50/30">
                {agenticMessages.map((msg, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: msg.role === "user" ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                      msg.role === "user" 
                        ? "bg-ink text-white rounded-tr-none" 
                        : "bg-white text-ink rounded-tl-none border border-slate-100"
                    }`}>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
                {isAgenticThinking && (
                  <div className="flex justify-start">
                    <div className="bg-white px-4 py-2.5 rounded-2xl rounded-tl-none border border-slate-100 flex gap-1 shadow-sm">
                      <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-ink/20 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                )}
                
                {draftPersona && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-6 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-emerald-600" size={14} />
                      <h3 className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-600/60">Draft Persona Ready</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-3xl shadow-md border border-emerald-100">
                        {draftPersona.avatar}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-emerald-900 mb-0.5">{draftPersona.name}</h4>
                        <p className="text-[10px] text-emerald-700/70 leading-relaxed font-medium">{draftPersona.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button 
                        onClick={() => savePersona({
                          id: Math.random().toString(36).substring(7),
                          name: draftPersona.name || "New Persona",
                          role: PersonaRole.AI_PERSONA,
                          description: draftPersona.description || "",
                          avatar: draftPersona.avatar || "👤",
                          color: "bg-emerald-100 text-emerald-700 border-emerald-200"
                        })}
                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                      >
                        Confirm & Add
                      </button>
                    </div>
                  </motion.div>
                )}
                <div ref={agenticEndRef} />
              </div>

              <form onSubmit={handleAgenticSubmit} className="p-6 bg-white border-t border-slate-100 flex gap-3">
                <input
                  type="text"
                  value={agenticInput}
                  onChange={(e) => setAgenticInput(e.target.value)}
                  placeholder="Talk to the Architect..."
                  className="flex-1 bg-muted border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent/10 transition-all outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={!agenticInput.trim() || isAgenticThinking}
                  className="w-12 h-12 bg-accent text-white rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 shadow-md"
                >
                  <Send size={18} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persona Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-ink leading-tight">Manage Personas</h2>
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Customize your debate roster</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={resetPersonas} className="text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors px-3 py-1.5 bg-slate-50 rounded-lg">Reset</button>
                  <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400"><X size={20} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30">
                {personas.map(p => (
                  <motion.div 
                    key={p.id} 
                    layout
                    className="flex items-center gap-4 p-4 bg-white rounded-xl group border border-slate-100 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 border border-slate-50 shadow-sm ${p.color}`}>
                      {p.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-ink truncate">{p.name}</h3>
                        <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-slate-50 rounded-full text-slate-400">{p.role}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed font-medium line-clamp-1">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => setEditingPersona(p)}
                        className="p-2 bg-slate-50 hover:bg-ink hover:text-white rounded-lg transition-all text-slate-400"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => deletePersona(p.id)}
                        className="p-2 bg-slate-50 hover:bg-red-500 hover:text-white rounded-lg transition-all text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
                
                <button 
                  onClick={() => setEditingPersona({
                    id: Math.random().toString(36).substring(7),
                    name: "",
                    role: PersonaRole.AI_PERSONA,
                    description: "",
                    avatar: "👤",
                    color: "bg-zinc-100 text-zinc-700 border-zinc-200"
                  })}
                  className="w-full p-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-300 font-bold hover:border-accent/30 hover:text-accent hover:bg-accent/5 transition-all group"
                >
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-all">
                    <Plus size={20} />
                  </div>
                  <span className="text-xs">Add New Persona</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persona Editor Form Modal */}
      <AnimatePresence>
        {editingPersona && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPersona(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8"
            >
              <h2 className="text-xl font-bold text-ink mb-6">
                {personas.find(p => p.id === editingPersona.id) ? "Edit Persona" : "New Persona"}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 block mb-1.5">Name</label>
                  <input 
                    type="text" 
                    value={editingPersona.name}
                    onChange={e => setEditingPersona({...editingPersona, name: e.target.value})}
                    placeholder="e.g. Chef Gordon"
                    className="w-full bg-muted border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/10 transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 block mb-1.5">Avatar (Emoji)</label>
                    <input 
                      type="text" 
                      value={editingPersona.avatar}
                      onChange={e => setEditingPersona({...editingPersona, avatar: e.target.value})}
                      className="w-full bg-muted border-none rounded-xl px-4 py-3 text-sm text-center outline-none focus:ring-2 focus:ring-accent/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 block mb-1.5">Role</label>
                    <div className="relative">
                      <select 
                        value={editingPersona.role}
                        onChange={e => setEditingPersona({...editingPersona, role: e.target.value as PersonaRole})}
                        className="w-full bg-muted border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/10 appearance-none cursor-pointer"
                      >
                        <option value={PersonaRole.AI_PERSONA}>Debater</option>
                        <option value={PersonaRole.MEDIATOR}>Mediator</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Settings size={12} />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 block mb-1.5">Personality Description</label>
                  <textarea 
                    value={editingPersona.description}
                    onChange={e => setEditingPersona({...editingPersona, description: e.target.value})}
                    placeholder="Describe their behavior..."
                    rows={3}
                    className="w-full bg-muted border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/10 resize-none transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setEditingPersona(null)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-xs bg-muted text-slate-500 hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => savePersona(editingPersona)}
                    disabled={!editingPersona.name || !editingPersona.description}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-xs bg-ink text-white hover:bg-ink/90 transition-all disabled:opacity-30 shadow-md active:scale-95"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
