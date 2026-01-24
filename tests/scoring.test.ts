import {
  calculateScore,
  resetPlayerForNextRound,
  areAllScoresUpdated,
} from "../src/components/Scoring/scoring";
import type { Player, InfluencerCard } from "../src/types/types";

describe("Scoring Logic Tests", () => {
  // Base test data
  const baseScore = 50;
  const correctMultiplier = 2;
  const wrongMultiplier = -1;

  const createPlayer = (
    id: string,
    name: string,
    score: number = 0,
    streak: number = 0,
    tacticUsed: string[] = [],
    scoreUpdated: boolean = false
  ): Player => ({
    id,
    name,
    room: "test-room",
    avatar: "avatar.png",
    score,
    streak,
    hasStreak: streak >= 3,
    status: false,
    tacticUsed,
    wasCorrect: false,
    scoreUpdated,
    streakUpdated: false,
  });

  const createInfluencerCard = (tactics: string[]): InfluencerCard => ({
    villain: "Test Villain",
    tactic: tactics,
  });

  describe("Basic Scoring Functionality", () => {
    it("should award correct score for all correct answers", () => {
      const players = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1", "tactic2"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1", "tactic2"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1", "tactic2"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(correctMultiplier * baseScore * 2); // 2 correct tactics
      expect(result[0].wasCorrect).toBe(true);
      expect(result[0].scoreUpdated).toBe(true);
    });

    it("should deduct score for wrong answers", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 0, [
          "wrongTactic1",
          "wrongTactic2",
        ]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 0, [
          "wrongTactic1",
          "wrongTactic2",
        ]),
      ];
      const influencerCard = createInfluencerCard([
        "correctTactic1",
        "correctTactic2",
      ]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(100 + wrongMultiplier * baseScore * 2); // Original score + penalty
      expect(result[0].wasCorrect).toBe(false);
      expect(result[0].scoreUpdated).toBe(true);
    });

    it("should handle mixed correct and wrong answers", () => {
      const players = [
        createPlayer("player1", "Player 1", 50, 0, [
          "correctTactic",
          "wrongTactic",
        ]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 50, 0, [
          "correctTactic",
          "wrongTactic",
        ]),
      ];
      const influencerCard = createInfluencerCard(["correctTactic"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      // Should get +100 for correct and -50 for wrong = +50 total
      expect(result[0].score).toBe(
        50 + correctMultiplier * baseScore + wrongMultiplier * baseScore
      );
      expect(result[0].wasCorrect).toBe(true); // Any correct should set wasCorrect to true
      expect(result[0].scoreUpdated).toBe(true);
    });

    it("should not allow score to go below 0", () => {
      const players = [
        createPlayer("player1", "Player 1", 10, 0, [
          "wrongTactic1",
          "wrongTactic2",
        ]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 10, 0, [
          "wrongTactic1",
          "wrongTactic2",
        ]),
      ];
      const influencerCard = createInfluencerCard(["correctTactic"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(0); // Should be capped at 0
    });
  });

  describe("Multiple Players Scoring", () => {
    it("should score multiple players correctly and only once each", () => {
      const players = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1"]),
        createPlayer("player2", "Player 2", 50, 0, ["tactic2"]),
        createPlayer("player3", "Player 3", 100, 0, ["wrongTactic"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1"]),
        createPlayer("player2", "Player 2", 50, 0, ["tactic2"]),
        createPlayer("player3", "Player 3", 100, 0, ["wrongTactic"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1", "tactic2"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(correctMultiplier * baseScore); // Player 1: 100
      expect(result[1].score).toBe(50 + correctMultiplier * baseScore); // Player 2: 150
      expect(result[2].score).toBe(100 + wrongMultiplier * baseScore); // Player 3: 50

      // All should be marked as scored
      expect(result.every((p) => p.scoreUpdated)).toBe(true);
    });

    it("should handle players not in fromClientPlayers array", () => {
      const players = [
        createPlayer("player1", "Player 1", 100),
        createPlayer("player2", "Player 2", 200),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 0, ["tactic1"]),
        // player2 not in fromClientPlayers
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(100 + correctMultiplier * baseScore); // Player 1 scored
      expect(result[1].score).toBe(200); // Player 2 unchanged
    });
  });

  describe("Streak Logic", () => {
    it("should increment streak when player gets correct answer", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].streak).toBe(3); // Should increment from 2 to 3
      expect(result[0].hasStreak).toBe(true); // Should be true when streak >= 3
      expect(result[0].streakUpdated).toBe(true);
    });

    it("should reset streak when player gets wrong answer", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 5, ["wrongTactic"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 5, ["wrongTactic"]),
      ];
      const influencerCard = createInfluencerCard(["correctTactic"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].streak).toBe(0); // Should reset to 0
      expect(result[0].hasStreak).toBe(false);
    });

    it("should maintain streak with mixed answers if any are correct", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, [
          "correctTactic",
          "wrongTactic",
        ]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, [
          "correctTactic",
          "wrongTactic",
        ]),
      ];
      const influencerCard = createInfluencerCard(["correctTactic"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].streak).toBe(3); // Should increment because one was correct
      expect(result[0].hasStreak).toBe(true);
    });
  });

  describe("Streak Bonus Logic", () => {
    it("should add streak bonus when streak >= 3 (early rounds)", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);
      const currentRound = 3; // Early round

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        currentRound
      );

      const expectedScore = 100 + correctMultiplier * baseScore + 1 * baseScore; // Base + correct + streak bonus
      expect(result[0].score).toBe(expectedScore);
      expect(result[0].hasStreak).toBe(true);
    });

    it("should add higher streak bonus in mid rounds", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);
      const currentRound = 7; // Mid round

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        currentRound
      );

      const expectedScore = 100 + correctMultiplier * baseScore + 2 * baseScore; // Base + correct + higher streak bonus
      expect(result[0].score).toBe(expectedScore);
    });

    it("should add highest streak bonus in late rounds", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);
      const currentRound = 12; // Late round

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        currentRound
      );

      const expectedScore = 100 + correctMultiplier * baseScore + 3 * baseScore; // Base + correct + highest streak bonus
      expect(result[0].score).toBe(expectedScore);
    });

    it("should not add streak bonus when streak < 3", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 1, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 1, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      const expectedScore = 100 + correctMultiplier * baseScore; // Only base + correct, no streak bonus
      expect(result[0].score).toBe(expectedScore);
      expect(result[0].hasStreak).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty tactic arrays", () => {
      const players = [createPlayer("player1", "Player 1", 100, 0, [])];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 0, []),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(100); // No change
      expect(result[0].wasCorrect).toBe(false);
    });

    it("should handle empty influencer card tactics", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 0, ["tactic1"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 0, ["tactic1"]),
      ];
      const influencerCard = createInfluencerCard([]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(100); // No change when no tactics to match
    });

    it("should handle null/undefined tacticUsed", () => {
      const players = [createPlayer("player1", "Player 1", 100)];
      players[0].tacticUsed = undefined;
      const fromClientPlayers = [createPlayer("player1", "Player 1", 100)];
      fromClientPlayers[0].tacticUsed = undefined;
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(result[0].score).toBe(100); // Should handle gracefully
    });
  });

  describe("Score Update Flags", () => {
    it("should mark all players as scoreUpdated after calculation", () => {
      const players = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1"]),
        createPlayer("player2", "Player 2", 50, 0, ["wrongTactic"]),
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 0, 0, ["tactic1"]),
        createPlayer("player2", "Player 2", 50, 0, ["wrongTactic"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        1
      );

      expect(areAllScoresUpdated(result)).toBe(true);
    });

    it("should correctly identify when not all scores are updated", () => {
      const players = [
        createPlayer("player1", "Player 1", 0, 0, [], true),
        createPlayer("player2", "Player 2", 50, 0, [], false),
      ];

      expect(areAllScoresUpdated(players)).toBe(false);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple players with different streak levels and bonuses", () => {
      const players = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]), // Will hit streak 3
        createPlayer("player2", "Player 2", 200, 5, ["tactic1"]), // Already has high streak
        createPlayer("player3", "Player 3", 150, 1, ["wrongTactic"]), // Will reset streak
      ];
      const fromClientPlayers = [
        createPlayer("player1", "Player 1", 100, 2, ["tactic1"]),
        createPlayer("player2", "Player 2", 200, 5, ["tactic1"]),
        createPlayer("player3", "Player 3", 150, 1, ["wrongTactic"]),
      ];
      const influencerCard = createInfluencerCard(["tactic1"]);
      const currentRound = 7; // Mid-game streak bonus = 2

      const result = calculateScore(
        fromClientPlayers,
        players,
        influencerCard,
        currentRound
      );

      // Player 1: 100 + 100 (correct) + 100 (streak bonus) = 300
      expect(result[0].score).toBe(300);
      expect(result[0].streak).toBe(3);
      expect(result[0].hasStreak).toBe(true);

      // Player 2: 200 + 100 (correct) + 100 (streak bonus) = 400
      expect(result[1].score).toBe(400);
      expect(result[1].streak).toBe(6);
      expect(result[1].hasStreak).toBe(true);

      // Player 3: 150 - 50 (wrong) = 100, streak reset
      expect(result[2].score).toBe(100);
      expect(result[2].streak).toBe(0);
      expect(result[2].hasStreak).toBe(false);
    });
  });

  describe("Utility Functions", () => {
    it("should reset player correctly for next round", () => {
      const player = createPlayer(
        "player1",
        "Player 1",
        100,
        3,
        ["tactic1"],
        true
      );
      player.status = true;

      resetPlayerForNextRound(player);

      expect(player.tacticUsed).toEqual([]);
      expect(player.status).toBe(false);
      expect(player.scoreUpdated).toBe(false);
      // Other properties should remain unchanged
      expect(player.score).toBe(100);
      expect(player.streak).toBe(3);
    });
  });
});
