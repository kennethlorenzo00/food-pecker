import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { Persona } from '../types';
import { firebaseConfig } from '../firebase-config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export async function savePersonaToFirestore(persona: Persona): Promise<string> {
  try {
    console.log('Attempting to save persona:', persona);
    console.log('Firebase config:', {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? 'SET' : 'NOT_SET',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
    });

    const docRef = await addDoc(collection(db, 'personas'), {
      ...persona,
      createdAt: new Date(),
      isPublic: true // All personas are public since no auth
    });
    console.log('Persona saved successfully with ID:', docRef.id);
    console.log('Document data:', {
      ...persona,
      createdAt: new Date(),
      isPublic: true
    });
    return docRef.id;
  } catch (error) {
    console.error('Detailed error saving persona:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    throw error;
  }
}

export async function loadPersonasFromFirestore(): Promise<Persona[]> {
  try {
    console.log('Loading personas from Firestore...');
    console.log('Firebase config check:', {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? 'SET' : 'NOT_SET',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
    });

    const q = query(collection(db, 'personas'), orderBy('createdAt', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);

    console.log('Query snapshot size:', querySnapshot.size);

    const personas: Persona[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log('Found persona:', data);
      personas.push({
        id: doc.id,
        name: data.name,
        avatar: data.avatar,
        description: data.description,
        role: data.role,
        color: data.color || 'bg-slate-50'
      });
    });

    console.log('Total personas loaded:', personas.length);
    return personas;
  } catch (error) {
    console.error('Detailed error loading personas:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    return [];
  }
}

export async function updatePersonaInFirestore(personaId: string, persona: Partial<Persona>): Promise<void> {
  try {
    const personaRef = doc(db, 'personas', personaId);
    await updateDoc(personaRef, {
      ...persona,
      updatedAt: new Date()
    });
    console.log('Persona updated:', personaId);
  } catch (error) {
    console.error('Error updating persona:', error);
    throw error;
  }
}

export async function deletePersonaFromFirestore(personaId: string): Promise<void> {
  try {
    const personaRef = doc(db, 'personas', personaId);
    await deleteDoc(personaRef);
    console.log('Persona deleted:', personaId);
  } catch (error) {
    console.error('Error deleting persona:', error);
    throw error;
  }
}

// Search personas by name
export async function searchPersonas(searchTerm: string): Promise<Persona[]> {
  try {
    const q = query(
      collection(db, 'personas'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const querySnapshot = await getDocs(q);

    const personas: Persona[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const name = data.name?.toLowerCase() || '';
      if (name.includes(searchTerm.toLowerCase())) {
        personas.push({
          id: doc.id,
          name: data.name,
          avatar: data.avatar,
          description: data.description,
          role: data.role,
          color: data.color || 'bg-slate-50'
        });
      }
    });

    return personas;
  } catch (error) {
    console.error('Error searching personas:', error);
    return [];
  }
}
