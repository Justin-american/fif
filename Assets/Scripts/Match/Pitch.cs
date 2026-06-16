using FIF.Data;

namespace FIF.Match
{
    /// <summary>
    /// A simple, engine-agnostic model of the playing surface (Part C). The
    /// origin is the centre spot; <c>x</c> spans the width (−halfWidth..+halfWidth)
    /// and <c>y</c> spans the length (−halfLength..+halfLength). The Home team
    /// defends the −y goal and attacks +y; the Away team is the mirror.
    ///
    /// This is where the normalized <see cref="FormationSlot"/> coordinates from
    /// Part B are turned into real on-pitch positions, so a full XI can be placed
    /// from data alone.
    /// </summary>
    public sealed class Pitch
    {
        // Standard pitch ~105m x 68m. Kept tunable but with sane defaults.
        public float Length { get; }
        public float Width { get; }

        public float HalfLength => Length * 0.5f;
        public float HalfWidth => Width * 0.5f;

        /// <summary>Width of each goal mouth (for shot/save and goal detection).</summary>
        public float GoalWidth { get; }

        /// <summary>Depth of the penalty area from the goal line.</summary>
        public float PenaltyAreaDepth { get; }

        /// <summary>Half-width of the penalty area.</summary>
        public float PenaltyAreaHalfWidth { get; }

        public Pitch(float length = 105f, float width = 68f,
            float goalWidth = 7.32f, float penaltyAreaDepth = 16.5f,
            float penaltyAreaHalfWidth = 20.16f)
        {
            Length = length;
            Width = width;
            GoalWidth = goalWidth;
            PenaltyAreaDepth = penaltyAreaDepth;
            PenaltyAreaHalfWidth = penaltyAreaHalfWidth;
        }

        /// <summary>Centre spot.</summary>
        public Vec2 Centre => Vec2.Zero;

        /// <summary>The y of the goal line a given side is attacking towards.</summary>
        public float AttackingGoalLine(TeamSide side) => side == TeamSide.Home ? HalfLength : -HalfLength;

        /// <summary>The y of the goal line a given side is defending.</summary>
        public float DefendingGoalLine(TeamSide side) => side == TeamSide.Home ? -HalfLength : HalfLength;

        /// <summary>Centre of the goal a side is attacking.</summary>
        public Vec2 AttackingGoalCentre(TeamSide side) => new Vec2(0f, AttackingGoalLine(side));

        /// <summary>Centre of the goal a side is defending.</summary>
        public Vec2 DefendingGoalCentre(TeamSide side) => new Vec2(0f, DefendingGoalLine(side));

        /// <summary>The penalty spot for the side that is attacking that end.</summary>
        public Vec2 AttackingPenaltySpot(TeamSide side)
        {
            float gl = AttackingGoalLine(side);
            float dir = side == TeamSide.Home ? -1f : 1f; // back towards centre from the goal line
            return new Vec2(0f, gl + dir * 11f);
        }

        /// <summary>
        /// Converts a normalized formation slot (x:0..1 left→right, y:0..1
        /// own-goal→opponent-goal) into a pitch position for the given side.
        /// </summary>
        public Vec2 FromFormation(FormationSlot slot, TeamSide side) =>
            FromNormalized(slot.normalizedPosition.x, slot.normalizedPosition.y, side);

        /// <summary>Normalized (x:0..1, y:0..1 own→opponent goal) → pitch metres.</summary>
        public Vec2 FromNormalized(float nx, float ny, TeamSide side)
        {
            // x: 0..1 left→right maps to −halfWidth..+halfWidth.
            float px = (nx - 0.5f) * Width;
            // y: 0 (own goal) .. 1 (opponent goal). Home own-goal is at −halfLength.
            float own = DefendingGoalLine(side);
            float opp = AttackingGoalLine(side);
            float py = own + (opp - own) * ny;
            return new Vec2(px, py);
        }

        /// <summary>True if a point is within the field of play (inclusive bounds).</summary>
        public bool IsInBounds(Vec2 p) =>
            p.x >= -HalfWidth && p.x <= HalfWidth &&
            p.y >= -HalfLength && p.y <= HalfLength;

        /// <summary>True if a point lies inside the penalty area in front of the given goal line.</summary>
        public bool IsInPenaltyArea(Vec2 p, float goalLineY)
        {
            if (System.Math.Abs(p.x) > PenaltyAreaHalfWidth) return false;
            float yFromLine = System.Math.Abs(p.y - goalLineY);
            // Only counts on the pitch side of the goal line.
            bool sameHalf = (goalLineY < 0f && p.y >= goalLineY) || (goalLineY > 0f && p.y <= goalLineY);
            return sameHalf && yFromLine <= PenaltyAreaDepth;
        }

        /// <summary>Clamps a point to stay within the field of play.</summary>
        public Vec2 Clamp(Vec2 p)
        {
            float cx = p.x < -HalfWidth ? -HalfWidth : (p.x > HalfWidth ? HalfWidth : p.x);
            float cy = p.y < -HalfLength ? -HalfLength : (p.y > HalfLength ? HalfLength : p.y);
            return new Vec2(cx, cy);
        }
    }
}
