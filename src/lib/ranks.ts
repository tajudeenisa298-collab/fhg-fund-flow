export const RANKS = [
  "Member",
  "Distributor",
  "Manager",
  "Senior Manager",
  "Executive Manager",
  "Director",
  "Emerald Director",
  "Sapphire Director",
  "1 Ruby Director",
  "2 Ruby Director",
  "3 Ruby Director",
  "4 Ruby Director",
  "5 Ruby Director",
  "1 Diamond Director",
  "2 Diamond Director",
  "3 Diamond Director",
  "4 Diamond Director",
  "5 Diamond Director",
] as const;

export type Rank = (typeof RANKS)[number];

export const DIRECTOR_INDEX = RANKS.indexOf("Director");

export const isDirectorOrAbove = (rank: string) => {
  const i = RANKS.indexOf(rank as Rank);
  return i >= DIRECTOR_INDEX;
};

export const rankIndex = (rank: string) => RANKS.indexOf(rank as Rank);
