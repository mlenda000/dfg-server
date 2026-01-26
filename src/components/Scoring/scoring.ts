import type { Player, InfluencerCard, WasScored } from "../../types/types";

const CORRECT_ANSWER = 2;
const WRONG_ANSWER = -1;

export function calculateScore(
  fromClientPlayers: Player[],
  players: Player[],
  influencerCard: InfluencerCard,
  currentRound: number
): Player[] {
  const streakBonus = currentRound < 5 ? 1 : currentRound < 10 ? 2 : 3;

  // Process each player in the existing players array
  const updatedPlayers = players.map((existingPlayer) => {
    const clientPlayer = fromClientPlayers.find(
      (p) => p.id === existingPlayer.id
    );

    // If the player is not found in client players, return the existing player unchanged
    if (!clientPlayer) return existingPlayer;

    // score will be points for this round, currentScore is the players score prior to this round
    let score = 0;
    let currentScore = existingPlayer.score || 0;
    let anyCorrect = false;
    const prevStreak = existingPlayer.streak || 0;

    if (influencerCard && influencerCard.tactic.length > 0) {
      // Filter out correct and wrong tactics
      const correctTactics =
        clientPlayer.tacticUsed?.filter((tactic) =>
          influencerCard.tactic.includes(tactic)
        ) || [];
      const wrongTactics =
        clientPlayer.tacticUsed?.filter(
          (tactic) => !influencerCard.tactic.includes(tactic)
        ) || [];

      console.log(`🎯 [calculateScore] Player ${clientPlayer.id}:`, {
        tacticUsed: clientPlayer.tacticUsed,
        influencerTactics: influencerCard.tactic,
        correctTactics,
        wrongTactics,
      });

      // Process correct tactics
      if (correctTactics.length > 0) {
        correctTactics.forEach(() => {
          score += CORRECT_ANSWER * 50;
          anyCorrect = true;
        });
      }

      // Process wrong tactics
      if (wrongTactics.length > 0) {
        wrongTactics.forEach(() => {
          score += WRONG_ANSWER * 50;
        });
      }

      console.log(
        `📊 [calculateScore] Round score for ${clientPlayer.id}: ${score}`
      );
    }

    // Add the players current score to the new points for this round
    let updatedScore = currentScore + score;
    updatedScore = Math.max(updatedScore, 0); // Ensure score doesn't go below 0

    // Update streak: increment if player got any correct answers, reset if all wrong
    const streak = anyCorrect ? prevStreak + 1 : 0;

    const updatedPlayer: Player = {
      ...existingPlayer,
      score: updatedScore,
      streak,
      hasStreak: streak >= 3, // Set hasStreak if streak >= 3
      scoreUpdated: true, // Mark score as updated
      streakUpdated: true, // Mark streak as updated
      wasCorrect: anyCorrect, // Set based on whether any answers were correct
    };

    // Add streak bonus if player has a streak >= 3
    if (updatedPlayer.hasStreak) {
      updatedPlayer.score += streakBonus * 50; // Add streak bonus
    }

    return updatedPlayer;
  });

  return updatedPlayers;
}
// export function calculateScore(
//   players: Player[],
//   influencerCard: InfluencerCard,
//   currentRound: number
// ): Player[] {
//   const streakBonus = currentRound < 5 ? 1 : currentRound < 10 ? 2 : 3;

//   // Map over players and return updated player objects
//   const updatedPlayers = players.map((existingPlayer) => {
//     // score will be points for this round, currentScore is the player's score prior to this round if they have one
//     let score = 0;
//     let currentScore = existingPlayer.score || 0;
//     let anyCorrect = false;
//     let wasCorrect = false;
//     let scoreUpdated = false;
//     let streakUpdated = false;

//     if (influencerCard && influencerCard.tactic.length > 0) {
//       // Filter out correct and wrong tactics
//       const correctTactics =
//         existingPlayer.tacticUsed?.filter((tactic) =>
//           influencerCard.tactic.includes(tactic)
//         ) || [];
//       const wrongTactics =
//         existingPlayer.tacticUsed?.filter(
//           (tactic) => !influencerCard.tactic.includes(tactic)
//         ) || [];

//       // Process correct tactics first
//       if (correctTactics.length > 0) {
//         correctTactics.forEach(() => {
//           score += CORRECT_ANSWER * 50;
//           anyCorrect = true;
//         });
//         if (wrongTactics.length === 0) {
//           scoreUpdated = true;
//         }
//       }

//       // Process wrong tactics second
//       if (wrongTactics.length > 0) {
//         wrongTactics.forEach(() => {
//           score += WRONG_ANSWER * 50;
//         });
//         scoreUpdated = true;
//       }

//       wasCorrect = anyCorrect;
//     }

//     // add the player's current score to the new points for this round
//     let updatedScore = currentScore + score;
//     updatedScore = Math.max(updatedScore, 0); // Ensure score doesn't go below 0;

//     // Once per round update if a streak has continued
//     const streak =
//       updatedScore > currentScore && anyCorrect
//         ? (existingPlayer.streak || 0) + 1
//         : 0;

//     const hasStreak = streak >= 3;

//     let finalScore = updatedScore;
//     if (hasStreak) {
//       finalScore += streakBonus * 50; // Add streak bonus
//     }

//     return {
//       ...existingPlayer,
//       score: finalScore,
//       streak,
//       hasStreak,
//       scoreUpdated: true,
//       streakUpdated: true,
//       wasCorrect,
//     };
//   });

//   console.log(updatedPlayers, "players after score calculation in scoring.ts");
//   return updatedPlayers;
// }

export function resetPlayerForNextRound(player: Player) {
  player.tacticUsed = [];
  player.status = false;
  player.scoreUpdated = false;
  player.streak = 0; // Reset streak for next round
  player.hasStreak = false; // Reset hasStreak flag
}

export function areAllScoresUpdated(players: Player[]): boolean {
  return players.every((player) => player.scoreUpdated);
}
