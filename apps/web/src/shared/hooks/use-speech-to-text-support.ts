import { useEffect, useState } from "react";
import { isSpeechToTextSupported } from "../utils/speech-to-text";

export function useSpeechToTextSupport(): boolean {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(isSpeechToTextSupported());
  }, []);

  return isSupported;
}
