using FIF.Core;

namespace FIF.Match
{
    /// <summary>
    /// Tunable parameters for a simulated match (Part C). Sensible defaults are
    /// provided and a convenience factory maps the user's <see cref="GameSettings"/>
    /// (half length, difficulty) onto the simulation.
    /// </summary>
    public sealed class MatchConfig
    {
        /// <summary>Length of one half, in seconds of simulated time.</summary>
        public float HalfLengthSeconds = 45f;

        /// <summary>Fixed simulation step in seconds.</summary>
        public float TimeStep = 0.1f;

        /// <summary>Distance (m) within which a player is considered to control the ball.</summary>
        public float ControlRadius = 1.2f;

        /// <summary>Deterministic RNG seed so a given matchup replays identically.</summary>
        public int Seed = 12345;

        /// <summary>
        /// 0..1 skill scaling applied to the AI-controlled opponent. Mapped from the
        /// difficulty setting; higher means sharper passing/shooting decisions.
        /// </summary>
        public float OpponentSkill = 0.6f;

        public static MatchConfig FromSettings(GameSettings settings)
        {
            var cfg = new MatchConfig();
            if (settings != null)
            {
                cfg.HalfLengthSeconds = UnityEngine.Mathf.Max(1, settings.matchLengthMinutes) * 60f;
                switch (settings.difficulty)
                {
                    case Difficulty.Beginner: cfg.OpponentSkill = 0.35f; break;
                    case Difficulty.SemiPro: cfg.OpponentSkill = 0.5f; break;
                    case Difficulty.Pro: cfg.OpponentSkill = 0.7f; break;
                    case Difficulty.Legendary: cfg.OpponentSkill = 0.9f; break;
                }
            }
            return cfg;
        }
    }
}
