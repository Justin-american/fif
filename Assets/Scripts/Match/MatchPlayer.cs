using FIF.Data;

namespace FIF.Match
{
    /// <summary>
    /// Runtime state for one player inside the headless match core (Part C).
    /// It is built from the data-layer <see cref="PlayerProfile"/> (Part B) and
    /// derives its movement capabilities from the player's pace/acceleration,
    /// while carrying the <see cref="PlayStyle"/> so the AI (and later the visual
    /// gameplay) can behave differently for the same position.
    /// </summary>
    public sealed class MatchPlayer
    {
        public readonly PlayerProfile Profile;
        public readonly TeamSide Side;

        /// <summary>The player's home position for the current formation (metres).</summary>
        public Vec2 HomePosition;

        /// <summary>Current position on the pitch (metres).</summary>
        public Vec2 Position;

        public MatchPlayer(PlayerProfile profile, TeamSide side, Vec2 home)
        {
            Profile = profile;
            Side = side;
            HomePosition = home;
            Position = home;
        }

        public PlayerPosition Position2 => Profile != null ? Profile.position : PlayerPosition.CM;
        public PlayStyle Style => Profile != null ? Profile.playStyle : PlayStyle.None;
        public bool IsGoalkeeper => Profile != null && Profile.position == PlayerPosition.GK;

        /// <summary>Top running speed in m/s, derived from the 0-100 pace attribute.</summary>
        public float MaxSpeed
        {
            get
            {
                int pace = Profile != null ? Profile.pace : 60;
                // ~5.5 m/s (pace 0) up to ~9.5 m/s (pace 100): plausible match speeds.
                return 5.5f + pace / 100f * 4f;
            }
        }

        /// <summary>How fast the player reaches top speed; scales the per-tick step.</summary>
        public float AccelerationFactor
        {
            get
            {
                int accel = Profile != null ? Profile.acceleration : 60;
                return 0.6f + accel / 100f * 0.4f; // 0.6..1.0
            }
        }

        /// <summary>The maximum distance this player can cover in <paramref name="dt"/> seconds.</summary>
        public float StepDistance(float dt) => MaxSpeed * AccelerationFactor * dt;

        /// <summary>Moves the player towards a target, capped by their speed this tick.</summary>
        public void MoveTowards(Vec2 target, float dt)
        {
            Position = Vec2.MoveTowards(Position, target, StepDistance(dt));
        }
    }
}
