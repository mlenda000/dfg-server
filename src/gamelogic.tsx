import { getPlayers, getPlayedCards, getInfluencerCards } from "./server.js";
import { useState } from "react";

const [playerCards, setPlayerCards] = useState<string[]>([]);
const [score, setScore] = useState(0);

const handlePlayerCardChange = (index: number, value: string) => {
  const newPlayerCards = [...playerCards];
  newPlayerCards[index] = value;
  setPlayerCards(newPlayerCards);
};

const calculateScore = () => {
    const influencerCards = getInfluencerCards("dfg-misinformation");
  let newScore = 0;
  const maxCards = influencerCards.length;

  for (let i = 0; i < maxCards; i++) {
    if (playerCards[i]) {
      if (playerCards[i] === influencerCards[i]) {
        newScore += 1;
      } else {
        newScore = Math.max(0, newScore - 1);
      }
    }
  }

  if (playerCards.length === maxCards && playerCards.every((card, index) => card === influencerCards[index])) {
    newScore += 1; // Bonus point for getting all correct
  }

  setScore(newScore);
};
