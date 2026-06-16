using UnityEngine;

namespace FIF.Data
{
    /// <summary>
    /// A single player's data. Authored as a ScriptableObject so designers can
    /// create/tune players in the Inspector without touching code (PART B2).
    /// All attributes are 0-100 unless noted, exactly as specified in the brief.
    /// </summary>
    [CreateAssetMenu(fileName = "Player", menuName = "FIF/Player Profile", order = 1)]
    public class PlayerProfile : ScriptableObject
    {
        [Header("Identity")]
        public string displayName = "Player";
        [Tooltip("Shirt number used on the kit and team sheet.")]
        public int shirtNumber = 1;
        public PlayerPosition position = PlayerPosition.CM;
        public PreferredFoot preferredFoot = PreferredFoot.Right;
        public PlayStyle playStyle = PlayStyle.None;
        [Tooltip("Marks the team captain. Only one per squad is expected.")]
        public bool isCaptain;

        [Header("Pace")]
        [Range(0, 100)] public int pace = 70;
        [Range(0, 100)] public int acceleration = 70;

        [Header("Attacking")]
        [Range(0, 100)] public int shooting = 60;
        [Range(0, 100)] public int passing = 65;
        [Range(0, 100)] public int dribbling = 65;
        [Range(0, 100)] public int vision = 60;
        [Range(0, 100)] public int composure = 65;
        [Range(0, 100)] public int positioning = 60;

        [Header("Defending / Physical")]
        [Range(0, 100)] public int defending = 50;
        [Range(0, 100)] public int physical = 65;
        [Range(0, 100)] public int heading = 55;
        [Range(0, 100)] public int jumping = 60;
        [Range(0, 100)] public int stamina = 75;
        [Range(0, 100)] public int aggression = 55;

        [Header("Misc")]
        [Range(1, 5)] public int weakFoot = 3;

        /// <summary>
        /// A convenience overall rating derived from the attributes most
        /// relevant to the player's position. Used for quick squad comparisons;
        /// the brief's authored team ratings remain the source of truth on the
        /// Team Select screen.
        /// </summary>
        public int Overall
        {
            get
            {
                switch (position)
                {
                    case PlayerPosition.GK:
                        // GK shares the rig but uses different attributes; we
                        // approximate keeper quality from positioning/composure.
                        return Avg(positioning, composure, jumping, physical);
                    case PlayerPosition.CB:
                    case PlayerPosition.RB:
                    case PlayerPosition.LB:
                        return Avg(defending, physical, heading, pace, passing);
                    case PlayerPosition.CDM:
                    case PlayerPosition.CM:
                        return Avg(passing, defending, physical, vision, dribbling);
                    case PlayerPosition.CAM:
                        return Avg(passing, dribbling, vision, shooting, composure);
                    default: // wingers and strikers
                        return Avg(shooting, dribbling, pace, passing, composure);
                }
            }
        }

        private static int Avg(params int[] values)
        {
            int sum = 0;
            for (int i = 0; i < values.Length; i++) sum += values[i];
            return Mathf.RoundToInt((float)sum / values.Length);
        }
    }
}
