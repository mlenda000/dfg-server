# Testing Documentation

## Overview

This project now includes comprehensive testing for the scoring logic using Jest. The tests ensure that the scoring system works correctly across various scenarios including multiple players, streak logic, and bonus calculations.

## Test Framework Setup

- **Jest**: Main testing framework
- **TypeScript Support**: Configured with `ts-jest` for TypeScript compilation
- **Coverage Reports**: Generate detailed coverage reports

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Core Test Categories

1. **Basic Scoring Functionality**

   - Correct answers scoring (2x base score per correct tactic)
   - Wrong answers penalty (-1x base score per wrong tactic)
   - Mixed correct/wrong answers
   - Score floor protection (cannot go below 0)

2. **Multiple Players Scoring**

   - Each player scored only once per round
   - Handles players not in submission array
   - Simultaneous scoring of multiple players

3. **Streak Logic**

   - Streak increments on correct answers
   - Streak resets on wrong answers only
   - Streak maintains if any answers are correct (mixed scenarios)
   - Streak threshold detection (≥3 for bonus)

4. **Streak Bonus Logic**

   - Early rounds (1-4): 1x base score bonus
   - Mid rounds (5-9): 2x base score bonus
   - Late rounds (10+): 3x base score bonus
   - Only applies when streak ≥ 3

5. **Edge Cases**

   - Empty tactic arrays
   - Null/undefined values
   - Empty influencer card tactics

6. **Utility Functions**
   - Player reset for next round
   - Score update flag checking

## Key Test Scenarios

### Multiple Player Scenario

```typescript
// Tests 3 players with different outcomes:
// Player 1: Gets streak bonus (hits 3-streak)
// Player 2: Already has high streak, continues it
// Player 3: Wrong answer, streak resets to 0
```

### Scoring Constants

- **Base Score**: 50 points
- **Correct Multiplier**: 2x (100 points per correct tactic)
- **Wrong Multiplier**: -1x (-50 points per wrong tactic)
- **Streak Bonus**: 1x, 2x, or 3x base score depending on round

### Streak Requirements

- **Streak Threshold**: 3 consecutive correct rounds for bonus
- **Streak Bonus Timing**: Applied when `hasStreak` is true (streak ≥ 3)
- **Streak Reset**: Only when all answers are wrong

## Test Coverage

The test suite provides comprehensive coverage of:

- ✅ All scoring calculations
- ✅ Streak logic and bonuses
- ✅ Multiple player scenarios
- ✅ Edge cases and error handling
- ✅ Utility functions
- ✅ Score update flags

## Adding New Tests

When adding new functionality to the scoring system:

1. Add test cases in `/tests/scoring.test.ts`
2. Follow the existing test structure
3. Include both positive and negative test cases
4. Test edge cases and boundary conditions
5. Ensure tests are descriptive and well-named

Example test structure:

```typescript
describe('New Feature Category', () => {
  it('should handle expected behavior', () => {
    // Arrange
    const players = [createPlayer(...)];
    const influencerCard = createInfluencerCard(...);

    // Act
    const result = calculateScore(...);

    // Assert
    expect(result[0].score).toBe(expectedScore);
  });
});
```

## Benefits of This Test Suite

1. **Regression Prevention**: Ensures changes don't break existing functionality
2. **Documentation**: Tests serve as living documentation of expected behavior
3. **Confidence**: High test coverage provides confidence in scoring accuracy
4. **Debugging**: Failing tests quickly identify where issues occur
5. **Refactoring Safety**: Enables safe code improvements with test validation

The scoring logic is now thoroughly tested and protected against regressions, ensuring that the game's core mechanics work reliably for all players in all scenarios.
