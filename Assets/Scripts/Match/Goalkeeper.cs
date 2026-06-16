using System;

namespace FIF.Match
{
    /// <summary>
    /// Goalkeeper behaviour for the headless match core (Part D). The keeper
    /// stays on a short line in front of the goal it defends, shading towards the
    /// ball's side, and attempts to save shots that are on target. Save odds are
    /// derived from the keeper's data attributes plus shot quality, so a better
    /// keeper concedes fewer goals — without any Unity dependency.
    /// </summary>
    public static class Goalkeeper
    {
        /// <summary>How far off the goal line the keeper holds (metres).</summary>
        private const float HoldOffLine = 2.5f;

        /// <summary>Computes the keeper's desired standing position for this tick.</summary>
        public static Vec2 DesiredPosition(MatchPlayer keeper, Pitch pitch, Vec2 ballPosition)
        {
            float goalLine = pitch.DefendingGoalLine(keeper.Side);
            float dir = goalLine < 0f ? 1f : -1f; // step onto the pitch from the line
            float y = goalLine + dir * HoldOffLine;

            // Shade across with the ball but stay within the goal mouth.
            float maxX = pitch.GoalWidth * 0.5f;
            float x = ballPosition.x;
            if (x > maxX) x = maxX;
            if (x < -maxX) x = -maxX;
            return new Vec2(x, y);
        }

        /// <summary>
        /// Decides whether the keeper saves a shot heading for goal.
        /// <paramref name="onTargetError"/> is how far (m) the shot would miss the
        /// goal centre laterally; <paramref name="shotSpeed"/> scales difficulty.
        /// </summary>
        public static bool TrySave(MatchPlayer keeper, float onTargetError, float shotSpeed,
            float distanceToGoal, Func<double> rng)
        {
            // Base keeper quality from handling proxies: jumping, physical, composure.
            var p = keeper.Profile;
            float quality = p != null
                ? (p.jumping + p.physical + p.composure) / 300f
                : 0.6f;

            // Closer, faster shots are harder to stop; well-placed (low error) too.
            float placement = Math.Max(0f, 1f - onTargetError / 3.66f); // 0 centre..1 post
            float pace = Math.Min(1f, shotSpeed / 30f);
            float proximity = Math.Min(1f, 1f - distanceToGoal / 30f);
            if (proximity < 0f) proximity = 0f;

            float shotThreat = 0.35f * placement + 0.35f * pace + 0.30f * proximity;

            // Save probability: keeper quality vs. shot threat, clamped to sane band.
            float saveChance = 0.95f * quality - 0.40f * shotThreat + 0.18f;
            if (saveChance < 0.05f) saveChance = 0.05f;
            if (saveChance > 0.97f) saveChance = 0.97f;

            return rng() < saveChance;
        }
    }
}
