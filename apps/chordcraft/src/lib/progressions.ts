export interface Progression {
  id: string;
  name: string;
  numerals: string[];
  genres: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export const progressions: Progression[] = [
  // Pop
  {
    id: "pop-1",
    name: "Pop Anthem",
    numerals: ["I", "V", "vi", "IV"],
    genres: ["pop"],
    difficulty: "beginner",
  },
  {
    id: "pop-2",
    name: "Classic Three-Chord",
    numerals: ["I", "IV", "V"],
    genres: ["pop", "rock"],
    difficulty: "beginner",
  },
  {
    id: "pop-3",
    name: "Sad Pop",
    numerals: ["vi", "IV", "I", "V"],
    genres: ["pop"],
    difficulty: "beginner",
  },
  {
    id: "pop-4",
    name: "Pachelbel Pop",
    numerals: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"],
    genres: ["pop"],
    difficulty: "intermediate",
  },
  // Rock
  {
    id: "rock-1",
    name: "Rock Mixolydian",
    numerals: ["I", "bVII", "IV"],
    genres: ["rock"],
    difficulty: "beginner",
  },
  {
    id: "rock-2",
    name: "Classic Rock Shuffle",
    numerals: ["I", "IV", "bVII"],
    genres: ["rock"],
    difficulty: "beginner",
  },
  {
    id: "rock-3",
    name: "Power Ballad",
    numerals: ["I", "V", "bVII", "IV"],
    genres: ["rock"],
    difficulty: "intermediate",
  },
  {
    id: "rock-4",
    name: "Grunge",
    numerals: ["I", "bIII", "bVII", "IV"],
    genres: ["rock"],
    difficulty: "intermediate",
  },
  // Blues
  {
    id: "blues-1",
    name: "12-Bar Blues",
    numerals: ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"],
    genres: ["blues"],
    difficulty: "beginner",
  },
  {
    id: "blues-2",
    name: "Minor Blues",
    numerals: ["i", "i", "i", "i", "iv", "iv", "i", "i", "V", "iv", "i", "V"],
    genres: ["blues"],
    difficulty: "intermediate",
  },
  {
    id: "blues-3",
    name: "Quick-Change Blues",
    numerals: ["I", "IV", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"],
    genres: ["blues"],
    difficulty: "intermediate",
  },
  // Jazz
  {
    id: "jazz-1",
    name: "ii-V-I",
    numerals: ["ii", "V", "I"],
    genres: ["jazz"],
    difficulty: "intermediate",
  },
  {
    id: "jazz-2",
    name: "Turnaround",
    numerals: ["I", "vi", "ii", "V"],
    genres: ["jazz"],
    difficulty: "intermediate",
  },
  {
    id: "jazz-3",
    name: "Bird Changes",
    numerals: ["iii", "vi", "ii", "V"],
    genres: ["jazz"],
    difficulty: "advanced",
  },
  {
    id: "jazz-4",
    name: "Backdoor ii-V",
    numerals: ["ii", "V", "I", "IV"],
    genres: ["jazz"],
    difficulty: "advanced",
  },
  {
    id: "jazz-5",
    name: "Autumn Leaves",
    numerals: ["ii", "V", "I", "IV", "vii\u00b0", "iii", "vi"],
    genres: ["jazz"],
    difficulty: "advanced",
  },
  // Folk / Country
  {
    id: "folk-1",
    name: "Folk Standard",
    numerals: ["I", "IV", "V", "I"],
    genres: ["folk", "country"],
    difficulty: "beginner",
  },
  {
    id: "folk-2",
    name: "Country Waltz",
    numerals: ["I", "V", "IV", "I"],
    genres: ["folk", "country"],
    difficulty: "beginner",
  },
  {
    id: "folk-3",
    name: "Nashville",
    numerals: ["I", "IV", "I", "V"],
    genres: ["country"],
    difficulty: "beginner",
  },
  {
    id: "folk-4",
    name: "Emotional Folk",
    numerals: ["I", "vi", "IV", "V"],
    genres: ["folk"],
    difficulty: "beginner",
  },
];

export const allGenres = Array.from(
  new Set(progressions.flatMap((p) => p.genres))
).sort();
