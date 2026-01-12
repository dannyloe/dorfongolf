import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

export interface VoiceCommand {
  type: "score" | "navigate" | "unknown";
  playerName?: string;
  hole?: number;
  score?: number;
  rawTranscript: string;
}

interface UseVoiceInputOptions {
  onCommand?: (command: VoiceCommand) => void;
  playerNames?: string[];
  continuous?: boolean;
}

interface UseVoiceInputResult {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  lastCommand: VoiceCommand | null;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  "11": 11, "12": 12, "13": 13, "14": 14, "15": 15, "16": 16, "17": 17, "18": 18,
  to: 2, too: 2, for: 4, fore: 4, ate: 8,
  birdie: -1, par: 0, bogey: 1, double: 2, triple: 3,
};

function parseNumber(text: string): number | null {
  const cleaned = text.toLowerCase().trim();
  if (numberWords[cleaned] !== undefined) {
    return numberWords[cleaned];
  }
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function findPlayerMatch(text: string, playerNames: string[]): string | null {
  const lowerText = text.toLowerCase();
  
  for (const name of playerNames) {
    const lowerName = name.toLowerCase();
    if (lowerText.includes(lowerName)) {
      return name;
    }
    const firstName = lowerName.split(/[\s\/]/)[0];
    if (firstName.length > 2 && lowerText.includes(firstName)) {
      return name;
    }
  }
  return null;
}

function parseVoiceCommand(transcript: string, playerNames: string[]): VoiceCommand {
  const text = transcript.toLowerCase().trim();
  
  const holePatterns = [
    /hole\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen)/i,
    /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen)\s*(?:th|st|nd|rd)?\s*hole/i,
  ];
  
  const scorePatterns = [
    /(?:score|scored|got|made|shot|had)\s*(?:a|an)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|birdie|par|bogey|double|triple)/i,
    /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:strokes?|shots?)/i,
    /(?:made|got)\s*(?:a|an)?\s*(birdie|par|bogey|eagle|double|triple)/i,
  ];
  
  let hole: number | undefined;
  for (const pattern of holePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseNumber(match[1]);
      if (parsed !== null && parsed >= 1 && parsed <= 18) {
        hole = parsed;
        break;
      }
    }
  }
  
  let score: number | undefined;
  for (const pattern of scorePatterns) {
    const match = text.match(pattern);
    if (match) {
      const scoreWord = match[1].toLowerCase();
      if (scoreWord === "birdie") {
        score = -1;
      } else if (scoreWord === "eagle") {
        score = -2;
      } else if (scoreWord === "par") {
        score = 0;
      } else if (scoreWord === "bogey") {
        score = 1;
      } else if (scoreWord === "double") {
        score = 2;
      } else if (scoreWord === "triple") {
        score = 3;
      } else {
        const parsed = parseNumber(scoreWord);
        if (parsed !== null && parsed >= 1 && parsed <= 15) {
          score = parsed;
        }
      }
      break;
    }
  }
  
  if (score === undefined) {
    const words = text.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
      const parsed = parseNumber(words[i]);
      if (parsed !== null && parsed >= 1 && parsed <= 15) {
        score = parsed;
        break;
      }
    }
  }
  
  const playerName = findPlayerMatch(text, playerNames);
  
  if (text.includes("next") || text.includes("forward")) {
    return { type: "navigate", rawTranscript: transcript };
  }
  if (text.includes("previous") || text.includes("back") || text.includes("last")) {
    return { type: "navigate", rawTranscript: transcript };
  }
  
  if (score !== undefined || playerName || hole !== undefined) {
    return {
      type: "score",
      playerName: playerName || undefined,
      hole,
      score,
      rawTranscript: transcript,
    };
  }
  
  return { type: "unknown", rawTranscript: transcript };
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { onCommand, playerNames = [], continuous = false } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onCommandRef = useRef(onCommand);
  const playerNamesRef = useRef(playerNames);
  
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  
  useEffect(() => {
    playerNamesRef.current = playerNames;
  }, [playerNames]);
  
  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  
  useEffect(() => {
    if (!isSupported) return;
    
    const SpeechRecognitionAPI = (window as WindowWithSpeech).SpeechRecognition || (window as WindowWithSpeech).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    
    const recognition = new SpeechRecognitionAPI();
    
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    
    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access.");
      } else if (event.error === "no-speech") {
        setError("No speech detected. Please try again.");
      } else {
        setError(`Voice error: ${event.error}`);
      }
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      setTranscript(finalTranscript || interimTranscript);
      
      if (finalTranscript) {
        const command = parseVoiceCommand(finalTranscript, playerNamesRef.current);
        setLastCommand(command);
        onCommandRef.current?.(command);
      }
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      recognition.abort();
    };
  }, [isSupported, continuous]);
  
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript("");
    setError(null);
    try {
      recognitionRef.current.start();
    } catch {
      setError("Could not start voice recognition");
    }
  }, []);
  
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  }, []);
  
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);
  
  return {
    isListening,
    isSupported,
    transcript,
    lastCommand,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
