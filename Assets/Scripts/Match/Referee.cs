using System;
using System.Collections.Generic;

namespace FIF.Match
{
    /// <summary>How play is restarted after the ball leaves play or an infringement.</summary>
    public enum RestartType
    {
        KickOff,
        ThrowIn,
        GoalKick,
        Corner,
        FreeKick,
        Penalty
    }

    /// <summary>A pending restart: where the ball goes and who takes it.</summary>
    public readonly struct Restart
    {
        public readonly RestartType type;
        public readonly Vec2 ballPosition;
        public readonly TeamSide takingSide;

        public Restart(RestartType type, Vec2 ballPosition, TeamSide takingSide)
        {
            this.type = type;
            this.ballPosition = ballPosition;
            this.takingSide = takingSide;
        }
    }

    /// <summary>
    /// The laws layer of the headless match core (Part D): detects goals, decides
    /// how the ball comes back into play when it goes out, judges offside, and
    /// awards free kicks/penalties for fouls. Pure functions over the pitch and
    /// positions so the engine stays the single source of truth for state.
    /// </summary>
    public static class Referee
    {
        public static TeamSide Other(TeamSide side) =>
            side == TeamSide.Home ? TeamSide.Away : TeamSide.Home;

        /// <summary>
        /// Returns true if the ball has fully crossed a goal line between the
        /// posts. <paramref name="scoringSide"/> is the side that scored.
        /// </summary>
        public static bool IsGoal(Pitch pitch, Vec2 ball, out TeamSide scoringSide)
        {
            float halfGoal = pitch.GoalWidth * 0.5f;
            if (Math.Abs(ball.x) <= halfGoal)
            {
                if (ball.y >= pitch.HalfLength)
                {
                    // Crossed the +y line: Home attacks +y, so Home scored.
                    scoringSide = TeamSide.Home;
                    return true;
                }
                if (ball.y <= -pitch.HalfLength)
                {
                    scoringSide = TeamSide.Away;
                    return true;
                }
            }
            scoringSide = TeamSide.Home;
            return false;
        }

        /// <summary>Kick-off restart for the given side at the centre spot.</summary>
        public static Restart KickOff(Pitch pitch, TeamSide takingSide) =>
            new Restart(RestartType.KickOff, pitch.Centre, takingSide);

        /// <summary>
        /// Resolves a ball that is out of play (already known to be out and not a
        /// goal). <paramref name="lastTouch"/> is the side that last played it.
        /// </summary>
        public static Restart ResolveBoundary(Pitch pitch, Vec2 ball, TeamSide lastTouch)
        {
            TeamSide opp = Other(lastTouch);

            // Side line → throw-in to the team that did not touch it last.
            if (Math.Abs(ball.x) > pitch.HalfWidth)
            {
                float clampedY = Clamp(ball.y, -pitch.HalfLength, pitch.HalfLength);
                float x = ball.x > 0f ? pitch.HalfWidth : -pitch.HalfWidth;
                return new Restart(RestartType.ThrowIn, new Vec2(x, clampedY), opp);
            }

            // Goal line (outside the posts) → corner or goal kick.
            // Determine which goal line was crossed.
            bool crossedHomeGoalLine = ball.y <= -pitch.HalfLength; // Home defends -y
            TeamSide goalLineOwner = crossedHomeGoalLine ? TeamSide.Home : TeamSide.Away;

            float goalLineY = crossedHomeGoalLine ? -pitch.HalfLength : pitch.HalfLength;

            if (lastTouch == goalLineOwner)
            {
                // Defending team put it out → corner to the attackers.
                float cornerX = ball.x >= 0f ? pitch.HalfWidth : -pitch.HalfWidth;
                return new Restart(RestartType.Corner, new Vec2(cornerX, goalLineY), opp);
            }
            else
            {
                // Attackers put it out → goal kick to the defenders.
                float dir = crossedHomeGoalLine ? 1f : -1f;
                var spot = new Vec2(0f, goalLineY + dir * pitch.PenaltyAreaDepth * 0.5f);
                return new Restart(RestartType.GoalKick, spot, goalLineOwner);
            }
        }

        /// <summary>
        /// Awards a free kick (or penalty if inside the box) to <paramref name="attackingSide"/>
        /// at the foul location.
        /// </summary>
        public static Restart AwardFreeKick(Pitch pitch, Vec2 foulSpot, TeamSide attackingSide)
        {
            float defendingGoalLine = pitch.DefendingGoalLine(Other(attackingSide));
            // The foul is committed by the defenders, so the relevant box is the
            // one the attacking side is shooting at = defenders' goal line.
            float targetGoalLine = pitch.AttackingGoalLine(attackingSide);
            if (pitch.IsInPenaltyArea(foulSpot, targetGoalLine))
                return new Restart(RestartType.Penalty, pitch.AttackingPenaltySpot(attackingSide), attackingSide);

            return new Restart(RestartType.FreeKick, pitch.Clamp(foulSpot), attackingSide);
        }

        /// <summary>
        /// Offside judgement at the moment of a pass: the receiver is offside if,
        /// in the attacking half, they are beyond both the ball and the
        /// second-last defender (here approximated by the last outfield defender
        /// plus keeper) towards the opponent goal line.
        /// </summary>
        public static bool IsOffside(Pitch pitch, TeamSide attackingSide,
            Vec2 receiver, Vec2 ball, IReadOnlyList<MatchPlayer> defenders)
        {
            float oppGoal = pitch.AttackingGoalLine(attackingSide);
            float sign = oppGoal > 0f ? 1f : -1f; // +1 if attacking +y

            // Only applies in the attacking half.
            if (receiver.y * sign <= 0f) return false;

            // Receiver must be ahead of the ball to be considered.
            if (receiver.y * sign <= ball.y * sign) return false;

            // Find the two deepest defenders (largest y towards their own goal).
            float deepest = float.NegativeInfinity, secondDeepest = float.NegativeInfinity;
            for (int i = 0; i < defenders.Count; i++)
            {
                float d = defenders[i].Position.y * sign;
                if (d > deepest)
                {
                    secondDeepest = deepest;
                    deepest = d;
                }
                else if (d > secondDeepest)
                {
                    secondDeepest = d;
                }
            }

            if (float.IsNegativeInfinity(secondDeepest)) return false;

            // Offside if receiver is beyond the second-last defender line.
            return receiver.y * sign > secondDeepest + 0.1f;
        }

        private static float Clamp(float v, float min, float max) =>
            v < min ? min : (v > max ? max : v);
    }
}
