import re
import time
from typing import Optional, List, Set, Tuple


class QuestionDetector:
    """
    Pause-assisted heuristic detector for interview questions.
    Filters out background noise, conversational fillers (e.g. 'okay, okay, okay'),
    and non-question statements, while deduplicating repeated questions.
    """

    QUESTION_WORDS = {
        "what", "why", "how", "when", "where", "who", "which",
        "can you", "could you", "would you", "will you",
        "do you", "did you", "have you", "are you",
        "should", "is it", "is there", "are there",
        "whats", "what's", "define", "compare",
    }

    INTERVIEW_PROMPTS = [
        "tell me about",
        "explain",
        "describe",
        "walk me through",
        "give an example",
        "share an experience",
        "what are the differences",
        "what is the difference",
        "how would you",
        "what happens when",
        "how do you handle",
        "how do you design",
        "how does",
        "why would you",
        "define",
        "compare",
    ]

    # Explicit filler words, affirmations, and small-talk
    FILLERS = {
        "ok", "okay", "k", "yeah", "yes", "yep", "nope", "no", "nah",
        "cool", "great", "awesome", "alright", "right", "sure", "got it", "i see",
        "uh huh", "mhm", "um", "uh", "hello", "hi", "hey",
        "thank you", "thanks", "sounds good", "perfect", "let's see", "let me know",
        "can you hear me", "am i audible", "testing", "one two three",
        "so we are going to go ahead and do this", "so we're going to go ahead and do this",
        "go ahead", "let's start", "let's go",
    }

    def __init__(self, min_pause_seconds: float = 0.5, min_words: int = 2):
        self.min_pause_seconds = min_pause_seconds
        self.min_words = min_words
        # Stores tuples of (normalized_words_set, original_text, timestamp)
        self.recent_answered: List[Tuple[Set[str], str, float]] = []
        self.last_detected_time: float = 0.0

    def _normalize(self, text: str) -> str:
        """Strip punctuation and lowercase for comparison."""
        cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", text.lower()).strip()
        return " ".join(cleaned.split())

    def _get_meaningful_words(self, text: str) -> Set[str]:
        """Extract set of words ignoring very common stop-words."""
        stopwords = {"the", "a", "an", "and", "or", "to", "in", "of", "for", "with", "at", "by", "from", "is", "are", "was", "were"}
        norm = self._normalize(text)
        return {w for w in norm.split() if w not in stopwords and len(w) > 1}

    def is_filler_or_small_talk(self, text: str) -> bool:
        """Checks if utterance consists of fillers, affirmations, or conversational chatter."""
        norm = self._normalize(text)
        if not norm:
            return True

        if norm in self.FILLERS:
            return True

        # Check for repeated fillers like "okay okay", "yeah yeah yeah", "ok ok"
        words = norm.split()
        unique_words = set(words)
        if len(unique_words) == 1 and list(unique_words)[0] in {"ok", "okay", "yeah", "cool", "right", "yes", "no", "sure", "mhm"}:
            return True
        if len(unique_words) <= 2 and unique_words.issubset({"ok", "okay", "yeah", "cool", "right", "yes", "sure", "so", "and"}):
            return True

        # Check common conversation transition filler prefixes/suffixes without a real question
        if all(w in {"so", "well", "okay", "alright", "then", "now", "just", "we", "are", "going", "to", "do", "this"} for w in words):
            return True

        return False

    def is_valid_interview_question(self, text: str) -> bool:
        """
        Determines whether the text represents a genuine interview question.
        Must NOT be small talk, must have at least 2 words (e.g. 'explain closures' or 'what is javascript'),
        and must contain question interrogatives or interview prompts.
        """
        raw = text.strip()
        words = raw.split()
        if len(words) < self.min_words or len(raw) < 6:
            return False

        if self.is_filler_or_small_talk(raw):
            return False

        lower_text = raw.lower()

        # Direct question mark
        if raw.endswith("?"):
            return True

        # Interrogative starter or prompt
        for qw in self.QUESTION_WORDS:
            if lower_text.startswith(qw) or f" {qw} " in lower_text:
                return True

        for prompt in self.INTERVIEW_PROMPTS:
            if prompt in lower_text:
                return True

        return False

    def is_duplicate_or_similar(self, text: str, threshold: float = 0.65) -> bool:
        """
        Checks if text is identical or substantially similar to a recently answered question.
        Prunes entries older than 30 seconds.
        """
        now = time.time()
        self.recent_answered = [entry for entry in self.recent_answered if (now - entry[2]) < 30.0]

        new_words = self._get_meaningful_words(text)
        if not new_words:
            return True

        norm_new = self._normalize(text)

        for past_words, past_orig, _ in self.recent_answered:
            # Exact match
            if norm_new == self._normalize(past_orig):
                return True

            # Jaccard similarity between meaningful words
            intersection = len(new_words.intersection(past_words))
            union = len(new_words.union(past_words))
            if union > 0:
                similarity = intersection / union
                if similarity >= threshold:
                    return True

        return False

    def evaluate(self, current_utterance: str, silence_duration: float, text_stable_seconds: float = 0.0) -> Optional[str]:
        """
        Evaluates current accumulated utterance.
        Triggers in <= 2.0s when speaker pauses.
        """
        text = current_utterance.strip()
        if not self.is_valid_interview_question(text):
            return None

        # Debounce: avoid firing multiple questions in rapid succession (< 1.5s)
        now = time.time()
        if now - self.last_detected_time < 1.5:
            return None

        # Check for duplicates or repeats
        if self.is_duplicate_or_similar(text):
            return None

        # Check completion pauses (scaled to min_pause_seconds or text stability)
        required_silence = (self.min_pause_seconds * 0.5) if text.endswith("?") else self.min_pause_seconds
        required_text_stability = 0.35 if text.endswith("?") else 0.6
        is_paused = (silence_duration >= required_silence) or (text_stable_seconds >= required_text_stability)

        if is_paused:
            self.recent_answered.append((self._get_meaningful_words(text), text, now))
            self.last_detected_time = now
            return text

        return None

    def record_answered(self, question: str) -> None:
        """Explicitly record a question as answered (e.g. from manual trigger)."""
        now = time.time()
        self.recent_answered.append((self._get_meaningful_words(question), question, now))
        self.last_detected_time = now

    def reset(self) -> None:
        """Reset history."""
        self.recent_answered.clear()
        self.last_detected_time = 0.0
