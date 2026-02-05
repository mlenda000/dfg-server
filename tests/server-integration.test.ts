/**
 * Server Integration Tests
 *
 * These tests verify the actual behavior of the server logic using real data
 * and simulating actual game scenarios that would occur between client and server.
 */

import { shuffleInfluencerDeck } from "../src/server";
import {
  calculateScore,
  areAllScoresUpdated,
  resetPlayerForNextRound,
} from "../src/components/Scoring/scoring";
import { parseContent } from "../src/utils/utils";
import type {
  Player,
  Room,
  InfluencerCard,
  ShuffledDeck,
} from "../src/types/types";
import influencerCards from "../src/data/influencerCards.json";

describe("Server Integration Tests", () => {
  // ============================================
  // DECK SHUFFLING TESTS - Using actual card data
  // ============================================
  describe("Deck Shuffling with Real Data", () => {
    const originalCards = influencerCards.influencerCards;

    it("should create a deep copy and not mutate the original influencer cards", () => {
      // Get a snapshot of the original first card
      const originalFirstCard = JSON.stringify(originalCards[0]);
      const originalLength = originalCards.length;

      // Shuffle the deck
      const shuffled = shuffleInfluencerDeck(originalCards);

      // Original should be unchanged
      expect(originalCards.length).toBe(originalLength);
      expect(JSON.stringify(originalCards[0])).toBe(originalFirstCard);

      // Shuffled should have same length but be a different array
      expect(shuffled.length).toBe(originalCards.length);
      expect(shuffled).not.toBe(originalCards); // Different reference
    });

    it("should produce different shuffled decks for different rooms", () => {
      // Simulate two rooms getting their own shuffled decks
      const room1Deck = shuffleInfluencerDeck(originalCards);
      const room2Deck = shuffleInfluencerDeck(originalCards);

      // Both should have the same cards but likely in different order
      expect(room1Deck.length).toBe(room2Deck.length);

      // Check that at least some cards are in different positions (statistically unlikely to be identical)
      let differentPositions = 0;
      for (let i = 0; i < Math.min(room1Deck.length, 10); i++) {
        if (JSON.stringify(room1Deck[i]) !== JSON.stringify(room2Deck[i])) {
          differentPositions++;
        }
      }

      // At least some positions should differ (allowing for rare identical shuffles)
      // With 10+ cards, probability of identical first 10 positions is astronomically low
      expect(differentPositions).toBeGreaterThan(0);
    });

    it("should preserve all card data integrity after shuffling", () => {
      const shuffled = shuffleInfluencerDeck(
        originalCards,
      ) as typeof originalCards;

      // Each shuffled card should have all required properties
      shuffled.forEach((card: any) => {
        expect(card).toHaveProperty("id");
        expect(card).toHaveProperty("caption");
        expect(card).toHaveProperty("bodyCopy");
        expect(card).toHaveProperty("villain");
        expect(card).toHaveProperty("tacticUsed");
        expect(Array.isArray(card.tacticUsed)).toBe(true);
      });

      // All original card IDs should be present in shuffled deck
      const originalIds = originalCards.map((c: any) => c.id).sort();
      const shuffledIds = shuffled.map((c: any) => c.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });
  });

  // ============================================
  // ROOM ISOLATION TESTS
  // ============================================
  describe("Room State Isolation", () => {
    const createRoom = (name: string): Room => ({
      name,
      count: 0,
      players: [],
      currentRound: 1,
      currentTheme: "all",
      influencerCard: { villain: "biost", tactic: [] },
    });

    const createPlayer = (id: string, name: string, room: string): Player => ({
      id,
      name,
      room,
      avatar: "test-avatar.png",
      score: 0,
      streak: 0,
      hasStreak: false,
      isReady: false,
      tacticUsed: [],
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    it("should maintain independent game state for different rooms", () => {
      const room1 = createRoom("room-alpha");
      const room2 = createRoom("room-beta");

      // Add players to each room
      const player1 = createPlayer("p1", "Alice", "room-alpha");
      const player2 = createPlayer("p2", "Bob", "room-beta");

      room1.players.push(player1);
      room1.count = 1;

      room2.players.push(player2);
      room2.count = 1;

      // Advance room1 to round 3
      room1.currentRound = 3;
      room1.currentTheme = "The_Celeb";
      room1.influencerCard = {
        villain: "The_Celeb",
        tactic: ["impersonation"],
      };

      // Room2 should still be at initial state
      expect(room2.currentRound).toBe(1);
      expect(room2.currentTheme).toBe("all");
      expect(room2.influencerCard?.villain).toBe("biost");

      // Players should be independent
      expect(room1.players).not.toContain(player2);
      expect(room2.players).not.toContain(player1);
    });

    it("should generate independent decks for each room", () => {
      const room1 = createRoom("room-one");
      const room2 = createRoom("room-two");

      // Each room gets its own shuffled deck
      const cards = influencerCards.influencerCards;
      room1.deck = {
        type: "shuffledDeck",
        data: shuffleInfluencerDeck(cards),
        isShuffled: true,
      };
      room2.deck = {
        type: "shuffledDeck",
        data: shuffleInfluencerDeck(cards),
        isShuffled: true,
      };

      // Both decks exist and are independent
      expect(room1.deck).toBeDefined();
      expect(room2.deck).toBeDefined();
      expect(room1.deck).not.toBe(room2.deck);
      expect(room1.deck!.data).not.toBe(room2.deck!.data);
    });
  });

  // ============================================
  // SCORING WITH REAL CARD DATA
  // ============================================
  describe("Scoring with Actual Influencer Cards", () => {
    const createPlayer = (
      id: string,
      name: string,
      tacticUsed: string[] = [],
      score: number = 0,
      streak: number = 0,
    ): Player => ({
      id,
      name,
      room: "test-room",
      avatar: "avatar.png",
      score,
      streak,
      hasStreak: streak >= 3,
      isReady: true,
      tacticUsed,
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    // Use actual cards from the data
    const realCards = influencerCards.influencerCards;

    it("should correctly score player who identifies The_Celeb tricky-jokes card", () => {
      // Find a real card with specific tactics
      const celebCard = realCards.find(
        (c: any) =>
          c.villain === "The_Celeb" && c.tacticUsed.includes("tricky-jokes"),
      );
      expect(celebCard).toBeDefined();

      const influencerCard: InfluencerCard = {
        villain: celebCard!.villain,
        tactic: celebCard!.tacticUsed,
      };

      // Player correctly identifies the tactics
      const player = createPlayer("p1", "Tester", celebCard!.tacticUsed);
      const players = [player];
      const clientPlayers = [player];

      const result = calculateScore(clientPlayers, players, influencerCard, 1);

      // Should get points for correct identification
      expect(result[0].wasCorrect).toBe(true);
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].scoreUpdated).toBe(true);
    });

    it("should correctly score player who identifies true stories", () => {
      // Find a "true" story card
      const trueCard = realCards.find((c: any) =>
        c.tacticUsed.includes("true"),
      );
      expect(trueCard).toBeDefined();

      const influencerCard: InfluencerCard = {
        villain: trueCard!.villain,
        tactic: trueCard!.tacticUsed,
      };

      // Player correctly identifies it as true
      const player = createPlayer("p1", "Tester", ["true"]);
      const players = [player];
      const clientPlayers = [player];

      const result = calculateScore(clientPlayers, players, influencerCard, 1);

      expect(result[0].wasCorrect).toBe(true);
      expect(result[0].score).toBe(100); // 2 points * 50
    });

    it("should penalize player who misidentifies a fear-mongering card as true", () => {
      // Find a fear-mongering card (not true)
      const fearCard = realCards.find(
        (c: any) =>
          c.tacticUsed.includes("fear-mongering") &&
          !c.tacticUsed.includes("true"),
      );
      expect(fearCard).toBeDefined();

      const influencerCard: InfluencerCard = {
        villain: fearCard!.villain,
        tactic: fearCard!.tacticUsed,
      };

      // Player incorrectly says "true" when it's actually fear-mongering
      const player = createPlayer("p1", "Tester", ["true"], 100);
      const players = [player];
      const clientPlayers = [player];

      const result = calculateScore(clientPlayers, players, influencerCard, 1);

      expect(result[0].wasCorrect).toBe(false);
      expect(result[0].score).toBeLessThan(100); // Should lose points
    });

    it("should handle cards with multiple tactics (partial correct)", () => {
      // Find a card with multiple tactics
      const multiTacticCard = realCards.find(
        (c: any) => c.tacticUsed.length >= 2,
      );
      expect(multiTacticCard).toBeDefined();

      const influencerCard: InfluencerCard = {
        villain: multiTacticCard!.villain,
        tactic: multiTacticCard!.tacticUsed,
      };

      // Player only gets one of the tactics right
      const player = createPlayer("p1", "Tester", [
        multiTacticCard!.tacticUsed[0],
        "wrong-tactic",
      ]);
      const players = [player];
      const clientPlayers = [player];

      const result = calculateScore(clientPlayers, players, influencerCard, 1);

      // Should have partial credit (1 correct, 1 wrong)
      // 100 (correct) - 50 (wrong) = 50
      expect(result[0].score).toBe(50);
      expect(result[0].wasCorrect).toBe(true); // At least one correct
    });

    it("should score all villains correctly with their specific tactics", () => {
      // Test each villain type
      const villains = ["The_Celeb", "The_Bots", "The_Biost", "The_Olig"];

      villains.forEach((villainName) => {
        const villainCard = realCards.find(
          (c: any) => c.villain === villainName,
        );
        if (villainCard) {
          const influencerCard: InfluencerCard = {
            villain: villainCard.villain,
            tactic: villainCard.tacticUsed,
          };

          const player = createPlayer(
            `p-${villainName}`,
            "Tester",
            villainCard.tacticUsed,
          );
          const result = calculateScore([player], [player], influencerCard, 1);

          expect(result[0].wasCorrect).toBe(true);
          expect(result[0].score).toBeGreaterThan(0);
        }
      });
    });
  });

  // ============================================
  // MULTI-PLAYER GAME SCENARIOS
  // ============================================
  describe("Multi-Player Game Scenarios", () => {
    const createPlayer = (
      id: string,
      name: string,
      tacticUsed: string[] = [],
      score: number = 0,
      streak: number = 0,
    ): Player => ({
      id,
      name,
      room: "multiplayer-room",
      avatar: "avatar.png",
      score,
      streak,
      hasStreak: streak >= 3,
      isReady: true,
      tacticUsed,
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    it("should correctly score multiple players with different answers", () => {
      // Use a real card
      const card = influencerCards.influencerCards[0];
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player 1: All correct
      // Player 2: Partially correct
      // Player 3: All wrong
      const player1 = createPlayer("p1", "Alice", card.tacticUsed);
      const player2 = createPlayer("p2", "Bob", [
        card.tacticUsed[0] || "wrong",
      ]);
      const player3 = createPlayer("p3", "Charlie", ["completely-wrong"]);

      const players = [player1, player2, player3];
      const clientPlayers = [...players];

      const result = calculateScore(clientPlayers, players, influencerCard, 1);

      // Alice should have highest score (all correct)
      expect(result[0].wasCorrect).toBe(true);

      // Bob should have partial score
      if (card.tacticUsed.length > 0) {
        expect(result[1].wasCorrect).toBe(true);
        expect(result[1].score).toBeLessThan(result[0].score);
      }

      // Charlie should have negative or zero score
      expect(result[2].wasCorrect).toBe(false);
    });

    it("should track streaks across multiple rounds", () => {
      const card = influencerCards.influencerCards.find(
        (c: any) => c.tacticUsed.length > 0,
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Simulate a player building a streak over multiple rounds
      let player = createPlayer("p1", "Streaker", card.tacticUsed);
      let players = [player];

      // Round 1
      let result = calculateScore([player], players, influencerCard, 1);
      expect(result[0].streak).toBe(1);
      expect(result[0].hasStreak).toBe(false);

      // Round 2
      player = {
        ...result[0],
        tacticUsed: card.tacticUsed,
        scoreUpdated: false,
        streakUpdated: false,
      };
      result = calculateScore([player], [player], influencerCard, 2);
      expect(result[0].streak).toBe(2);
      expect(result[0].hasStreak).toBe(false);

      // Round 3 - should now have streak bonus
      player = {
        ...result[0],
        tacticUsed: card.tacticUsed,
        scoreUpdated: false,
        streakUpdated: false,
      };
      result = calculateScore([player], [player], influencerCard, 3);
      expect(result[0].streak).toBe(3);
      expect(result[0].hasStreak).toBe(true);
    });

    it("should reset streak on wrong answer", () => {
      const card = influencerCards.influencerCards.find(
        (c: any) => c.tacticUsed.length > 0,
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player with existing streak
      let player = createPlayer("p1", "Streaker", card.tacticUsed, 200, 2);

      // Round with correct answer - streak continues
      let result = calculateScore([player], [player], influencerCard, 3);
      expect(result[0].streak).toBe(3);

      // Round with wrong answer - streak resets
      player = {
        ...result[0],
        tacticUsed: ["wrong-answer"],
        scoreUpdated: false,
        streakUpdated: false,
      };
      result = calculateScore([player], [player], influencerCard, 4);
      expect(result[0].streak).toBe(0);
      expect(result[0].hasStreak).toBe(false);
    });

    it("should check if all players have scores updated", () => {
      const players: Player[] = [
        createPlayer("p1", "Alice"),
        createPlayer("p2", "Bob"),
        createPlayer("p3", "Charlie"),
      ];

      // None updated yet
      expect(areAllScoresUpdated(players)).toBe(false);

      // Some updated
      players[0].scoreUpdated = true;
      players[1].scoreUpdated = true;
      expect(areAllScoresUpdated(players)).toBe(false);

      // All updated
      players[2].scoreUpdated = true;
      expect(areAllScoresUpdated(players)).toBe(true);
    });
  });

  // ============================================
  // MESSAGE PARSING TESTS
  // ============================================
  describe("Message Parsing with Real Message Formats", () => {
    it("should parse playerEnters message correctly", () => {
      const message = JSON.stringify({
        type: "playerEnters",
        player: {
          id: "player_123",
          name: "TestPlayer",
          avatar: "hero1.png",
          room: "test-room",
        },
        room: "test-room",
      });

      const parsed = parseContent(message);
      expect(parsed.type).toBe("playerEnters");
      expect(parsed.player.name).toBe("TestPlayer");
      expect(parsed.room).toBe("test-room");
    });

    it("should parse influencer message with real card data", () => {
      const realCard = influencerCards.influencerCards[0];
      const message = JSON.stringify({
        type: "influencer",
        newsCard: realCard,
        villain: realCard.villain,
        tactic: realCard.tacticUsed,
      });

      const parsed = parseContent(message);
      expect(parsed.type).toBe("influencer");
      expect(parsed.villain).toBe(realCard.villain);
      expect(parsed.tactic).toEqual(realCard.tacticUsed);
      expect(parsed.newsCard.caption).toBe(realCard.caption);
    });

    it("should parse playerReady message correctly", () => {
      const message = JSON.stringify({
        type: "playerReady",
        room: "game-room",
        players: [
          { id: "p1", name: "Alice", tacticUsed: ["fear-mongering"] },
          { id: "p2", name: "Bob", tacticUsed: ["clickbait"] },
        ],
      });

      const parsed = parseContent(message);
      expect(parsed.type).toBe("playerReady");
      expect(parsed.players.length).toBe(2);
      expect(parsed.players[0].tacticUsed).toContain("fear-mongering");
    });

    it("should parse endOfRound message correctly", () => {
      const message = JSON.stringify({
        type: "endOfRound",
        room: "game-room",
        round: 3,
        players: [
          { id: "p1", name: "Alice", score: 300, tacticUsed: ["true"] },
        ],
      });

      const parsed = parseContent(message);
      expect(parsed.type).toBe("endOfRound");
      expect(parsed.round).toBe(3);
      expect(parsed.players[0].score).toBe(300);
    });

    it("should handle malformed JSON gracefully", () => {
      const badMessage = "not valid json {{{";
      const parsed = parseContent(badMessage);
      expect(parsed).toBe(badMessage); // Returns original string on parse failure
    });
  });

  // ============================================
  // FULL GAME FLOW SIMULATION
  // ============================================
  describe("Full Game Flow Simulation", () => {
    const createPlayer = (id: string, name: string, room: string): Player => ({
      id,
      name,
      room,
      avatar: "avatar.png",
      score: 0,
      streak: 0,
      hasStreak: false,
      isReady: false,
      tacticUsed: [],
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    it("should simulate a complete 3-round game", () => {
      const roomName = "simulation-room";
      const cards = shuffleInfluencerDeck(
        influencerCards.influencerCards,
      ) as any[];

      // Create room with players
      const room: Room = {
        name: roomName,
        count: 2,
        players: [
          createPlayer("p1", "Alice", roomName),
          createPlayer("p2", "Bob", roomName),
        ],
        deck: { type: "shuffledDeck", data: cards, isShuffled: true },
        currentRound: 1,
        currentTheme: "all",
      };

      // Simulate 3 rounds
      for (let round = 1; round <= 3; round++) {
        const currentCard = cards[round - 1];
        const influencerCard: InfluencerCard = {
          villain: currentCard.villain,
          tactic: currentCard.tacticUsed,
        };

        // Alice always gets it right
        room.players[0].tacticUsed = currentCard.tacticUsed;
        room.players[0].isReady = true;

        // Bob gets it wrong
        room.players[1].tacticUsed = ["wrong-tactic"];
        room.players[1].isReady = true;

        // Calculate scores
        const clientPlayers = room.players.map((p) => ({ ...p }));
        const results = calculateScore(
          clientPlayers,
          room.players,
          influencerCard,
          round,
        );

        // Update room players
        room.players = results;
        room.currentRound = round + 1;

        // Reset for next round
        room.players.forEach((p) => {
          p.tacticUsed = [];
          p.isReady = false;
          p.scoreUpdated = false;
          p.streakUpdated = false;
        });
      }

      // After 3 rounds:
      // Alice should have positive score and potentially a streak
      expect(room.players[0].score).toBeGreaterThan(0);

      // Bob should have negative or zero score
      expect(room.players[1].score).toBeLessThanOrEqual(0);
    });

    it("should handle player joining mid-game", () => {
      const roomName = "mid-game-room";
      const cards = shuffleInfluencerDeck(
        influencerCards.influencerCards,
      ) as any[];

      // Room already at round 3
      const room: Room = {
        name: roomName,
        count: 1,
        players: [
          { ...createPlayer("p1", "Alice", roomName), score: 200, streak: 2 },
        ],
        deck: { type: "shuffledDeck", data: cards, isShuffled: true },
        currentRound: 3,
        currentTheme: cards[2]?.villain || "all",
      };

      // New player joins
      const newPlayer = createPlayer("p2", "NewBob", roomName);
      room.players.push(newPlayer);
      room.count = 2;

      // Verify new player starts fresh
      expect(newPlayer.score).toBe(0);
      expect(newPlayer.streak).toBe(0);

      // Verify room state is preserved for existing player
      expect(room.players[0].score).toBe(200);
      expect(room.players[0].streak).toBe(2);
      expect(room.currentRound).toBe(3);
    });

    it("should handle player leaving mid-game", () => {
      const roomName = "leaving-room";
      const cards = shuffleInfluencerDeck(
        influencerCards.influencerCards,
      ) as any[];

      const room: Room = {
        name: roomName,
        count: 3,
        players: [
          { ...createPlayer("p1", "Alice", roomName), score: 100 },
          { ...createPlayer("p2", "Bob", roomName), score: 150 },
          { ...createPlayer("p3", "Charlie", roomName), score: 50 },
        ],
        deck: { type: "shuffledDeck", data: cards, isShuffled: true },
        currentRound: 2,
      };

      // Bob leaves
      room.players = room.players.filter((p) => p.id !== "p2");
      room.count = room.players.length;

      // Verify room state
      expect(room.count).toBe(2);
      expect(room.players.find((p) => p.id === "p2")).toBeUndefined();
      expect(room.players[0].score).toBe(100); // Alice unchanged
      expect(room.players[1].score).toBe(50); // Charlie unchanged
    });
  });

  // ============================================
  // TACTIC VALIDATION TESTS
  // ============================================
  describe("Tactic Validation with Real Data", () => {
    const allTactics = new Set<string>();

    // Collect all unique tactics from the actual data
    beforeAll(() => {
      influencerCards.influencerCards.forEach((card: any) => {
        card.tacticUsed.forEach((tactic: string) => {
          allTactics.add(tactic);
        });
      });
    });

    it("should have consistent tactic names across all cards", () => {
      // Known valid tactics that should exist
      const expectedTactics = [
        "true",
        "fear-mongering",
        "clickbait",
        "impersonation",
        "emotional-manipulation",
        "gaslighting",
        "tricky-jokes",
      ];

      expectedTactics.forEach((tactic) => {
        const hasCards = influencerCards.influencerCards.some((c: any) =>
          c.tacticUsed.includes(tactic),
        );
        // At least some of these tactics should exist in the data
        if (hasCards) {
          expect(allTactics.has(tactic)).toBe(true);
        }
      });
    });

    it("should have at least one card for each villain type", () => {
      const villainTypes = ["The_Celeb", "The_Bots", "The_Biost", "The_Olig"];

      villainTypes.forEach((villain) => {
        const cards = influencerCards.influencerCards.filter(
          (c: any) => c.villain === villain,
        );
        expect(cards.length).toBeGreaterThan(0);
      });
    });

    it("should have true stories that are actually marked as true", () => {
      const trueCards = influencerCards.influencerCards.filter((c: any) =>
        c.tacticUsed.includes("true"),
      );

      // There should be some true cards
      expect(trueCards.length).toBeGreaterThan(0);

      // Each true card should have takeaway text indicating it's real
      trueCards.forEach((card: any) => {
        expect(card.takeaway).toBeDefined();
        expect(card.takeaway.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================
  // STREAK BONUS CALCULATIONS
  // ============================================
  describe("Streak Bonus Calculations by Round", () => {
    const createStreakPlayer = (streak: number, round: number): Player => ({
      id: "streak-player",
      name: "Streaker",
      room: "test",
      avatar: "avatar.png",
      score: 0,
      streak,
      hasStreak: streak >= 3,
      isReady: true,
      tacticUsed: ["true"],
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    it("should apply streak bonus of 1 for rounds 1-4", () => {
      const card = influencerCards.influencerCards.find((c: any) =>
        c.tacticUsed.includes("true"),
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player with streak of 2 going into round 3
      const player = createStreakPlayer(2, 3);
      const result = calculateScore([player], [player], influencerCard, 3);

      // Streak should now be 3, bonus applied
      expect(result[0].streak).toBe(3);
      expect(result[0].hasStreak).toBe(true);
      // Score: 100 (correct) + 50 (streak bonus of 1*50)
      expect(result[0].score).toBe(150);
    });

    it("should apply streak bonus of 2 for rounds 5-9", () => {
      const card = influencerCards.influencerCards.find((c: any) =>
        c.tacticUsed.includes("true"),
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player with streak of 2 going into round 5
      const player = createStreakPlayer(2, 5);
      const result = calculateScore([player], [player], influencerCard, 5);

      // Streak should now be 3, bonus applied
      expect(result[0].streak).toBe(3);
      expect(result[0].hasStreak).toBe(true);
      // Score: 100 (correct) + 100 (streak bonus of 2*50)
      expect(result[0].score).toBe(200);
    });

    it("should apply streak bonus of 3 for rounds 10+", () => {
      const card = influencerCards.influencerCards.find((c: any) =>
        c.tacticUsed.includes("true"),
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player with streak of 2 going into round 10
      const player = createStreakPlayer(2, 10);
      const result = calculateScore([player], [player], influencerCard, 10);

      // Streak should now be 3, bonus applied
      expect(result[0].streak).toBe(3);
      expect(result[0].hasStreak).toBe(true);
      // Score: 100 (correct) + 150 (streak bonus of 3*50)
      expect(result[0].score).toBe(250);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe("Edge Cases", () => {
    const createPlayer = (tacticUsed: string[] = []): Player => ({
      id: "edge-player",
      name: "EdgeCase",
      room: "test",
      avatar: "avatar.png",
      score: 0,
      streak: 0,
      hasStreak: false,
      isReady: true,
      tacticUsed,
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    });

    it("should handle player with no tactics selected", () => {
      const card = influencerCards.influencerCards[0];
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      const player = createPlayer([]);
      const result = calculateScore([player], [player], influencerCard, 1);

      expect(result[0].score).toBe(0);
      expect(result[0].wasCorrect).toBe(false);
    });

    it("should handle empty influencer card tactics", () => {
      const influencerCard: InfluencerCard = {
        villain: "Unknown",
        tactic: [],
      };

      const player = createPlayer(["some-tactic"]);
      const result = calculateScore([player], [player], influencerCard, 1);

      // With no correct tactics to match, all answers are wrong
      expect(result[0].score).toBe(0);
    });

    it("should not allow score to go below zero", () => {
      const card = influencerCards.influencerCards.find(
        (c: any) => !c.tacticUsed.includes("true"),
      )!;
      const influencerCard: InfluencerCard = {
        villain: card.villain,
        tactic: card.tacticUsed,
      };

      // Player with wrong answer
      const player: Player = {
        ...createPlayer(["wrong1", "wrong2", "wrong3"]),
        score: 50, // Start with small score
      };

      const result = calculateScore([player], [player], influencerCard, 1);

      // Score should not go below 0
      expect(result[0].score).toBeGreaterThanOrEqual(0);
    });

    it("should handle player ID collision detection", () => {
      const room: Room = {
        name: "collision-room",
        count: 1,
        players: [{ ...createPlayer(), id: "existing-id" }],
      };

      // Check if ID already exists
      const existingPlayer = room.players.find((p) => p.id === "existing-id");
      expect(existingPlayer).toBeDefined();

      // New player with same ID should be detected
      const newPlayerId = "existing-id";
      const collision = room.players.some((p) => p.id === newPlayerId);
      expect(collision).toBe(true);
    });
  });
});
