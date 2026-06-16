using System.Collections.Generic;
using UnityEngine;

namespace FIF.Data
{
    /// <summary>
    /// A team and its squad (PART B). Authored as a ScriptableObject so the
    /// Team Select screen, formations and match spawner are all driven by data.
    /// Team ratings (ATK/DEF/MID) are authored to match the brief; OVR is
    /// computed from them.
    /// </summary>
    [CreateAssetMenu(fileName = "Team", menuName = "FIF/Team Data", order = 0)]
    public class TeamData : ScriptableObject
    {
        [Header("Identity")]
        [Tooltip("PL-inspired generic name to avoid trademarks, e.g. 'Manchester Blue'.")]
        public string teamName = "Team";
        [Tooltip("Short tag shown on compact UI, e.g. 'MCB'.")]
        public string shortName = "TEM";
        public string formation = "4-3-3";

        [Header("Colours / Crest")]
        public Color primaryColor = Color.white;
        public Color secondaryColor = Color.black;
        [Tooltip("Optional crest sprite placeholder.")]
        public Sprite crest;

        [Header("Authored Ratings (shown on Team Select)")]
        [Range(0, 100)] public int attack = 80;
        [Range(0, 100)] public int defense = 80;
        [Range(0, 100)] public int midfield = 80;

        [Header("Squad")]
        [Tooltip("Starting XI in formation order (GK first). Expected length: 11.")]
        public List<PlayerProfile> startingXI = new List<PlayerProfile>();
        [Tooltip("Substitutes / bench players.")]
        public List<PlayerProfile> bench = new List<PlayerProfile>();

        /// <summary>Overall rating computed from the three authored line ratings.</summary>
        public int Overall => Mathf.RoundToInt((attack + defense + midfield) / 3f);

        /// <summary>Returns the captain from the starting XI, or null if none flagged.</summary>
        public PlayerProfile Captain
        {
            get
            {
                foreach (var p in startingXI)
                    if (p != null && p.isCaptain) return p;
                return null;
            }
        }
    }
}
