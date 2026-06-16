using System.Collections.Generic;
using UnityEngine;

namespace FIF.Data
{
    /// <summary>
    /// Broad role bands used to validate that a squad's player fits a formation
    /// slot without over-constraining interchangeable central/attacking roles
    /// (e.g. a CDM, CM or CAM may all fill a midfield slot).
    /// </summary>
    public enum PositionGroup
    {
        Goalkeeper,
        Defender,
        Midfielder,
        Forward
    }

    /// <summary>
    /// One slot in a formation: the canonical role for the slot plus its
    /// normalized pitch coordinate. Coordinates are in [0,1]:
    /// <c>x</c> runs left (0) to right (1); <c>y</c> runs from the team's own
    /// goal line (0) to the opponent's goal line (1). The match spawner (Part C)
    /// mirrors/scales these onto the real pitch per side.
    /// </summary>
    public readonly struct FormationSlot
    {
        public readonly PlayerPosition position;
        public readonly Vector2 normalizedPosition;

        public FormationSlot(PlayerPosition position, float x, float y)
        {
            this.position = position;
            this.normalizedPosition = new Vector2(x, y);
        }

        public PositionGroup Group => FormationLibrary.GroupOf(position);
    }

    /// <summary>
    /// Static, data-driven catalogue mapping each formation string stored on a
    /// <see cref="TeamData"/> (e.g. "4-3-3", "4-2-3-1") to its 11 on-pitch slots
    /// in starting-XI order (GK first). This turns <c>TeamData.formation</c> from
    /// a display-only string into positional data the spawner and AI can consume
    /// (Part B). Designers can extend it by adding entries here; unknown
    /// formations are reported by <see cref="SquadValidator"/>.
    /// </summary>
    public static class FormationLibrary
    {
        private static readonly Dictionary<string, FormationSlot[]> Formations =
            new Dictionary<string, FormationSlot[]>
            {
                ["4-3-3"] = new[]
                {
                    new FormationSlot(PlayerPosition.GK, 0.50f, 0.05f),
                    new FormationSlot(PlayerPosition.RB, 0.85f, 0.25f),
                    new FormationSlot(PlayerPosition.CB, 0.62f, 0.18f),
                    new FormationSlot(PlayerPosition.CB, 0.38f, 0.18f),
                    new FormationSlot(PlayerPosition.LB, 0.15f, 0.25f),
                    new FormationSlot(PlayerPosition.CDM, 0.50f, 0.38f),
                    new FormationSlot(PlayerPosition.CM, 0.68f, 0.50f),
                    new FormationSlot(PlayerPosition.CM, 0.32f, 0.50f),
                    new FormationSlot(PlayerPosition.RW, 0.82f, 0.72f),
                    new FormationSlot(PlayerPosition.LW, 0.18f, 0.72f),
                    new FormationSlot(PlayerPosition.ST, 0.50f, 0.82f),
                },
                ["4-2-3-1"] = new[]
                {
                    new FormationSlot(PlayerPosition.GK, 0.50f, 0.05f),
                    new FormationSlot(PlayerPosition.RB, 0.85f, 0.25f),
                    new FormationSlot(PlayerPosition.CB, 0.62f, 0.18f),
                    new FormationSlot(PlayerPosition.CB, 0.38f, 0.18f),
                    new FormationSlot(PlayerPosition.LB, 0.15f, 0.25f),
                    new FormationSlot(PlayerPosition.CM, 0.62f, 0.40f),
                    new FormationSlot(PlayerPosition.CDM, 0.38f, 0.40f),
                    new FormationSlot(PlayerPosition.CAM, 0.50f, 0.60f),
                    new FormationSlot(PlayerPosition.RW, 0.80f, 0.66f),
                    new FormationSlot(PlayerPosition.LW, 0.20f, 0.66f),
                    new FormationSlot(PlayerPosition.ST, 0.50f, 0.82f),
                },
            };

        /// <summary>Expected number of slots in any complete formation.</summary>
        public const int SlotCount = 11;

        /// <summary>True if a formation with this name is defined.</summary>
        public static bool IsKnown(string formation) =>
            !string.IsNullOrEmpty(formation) && Formations.ContainsKey(formation);

        /// <summary>
        /// Returns the 11 slots for the named formation, or null if it is unknown.
        /// The array is the shared definition; callers must not mutate it.
        /// </summary>
        public static FormationSlot[] Get(string formation)
        {
            if (!string.IsNullOrEmpty(formation) &&
                Formations.TryGetValue(formation, out var slots))
                return slots;
            return null;
        }

        /// <summary>The formation names this library knows about.</summary>
        public static IEnumerable<string> KnownFormations => Formations.Keys;

        /// <summary>Maps a fine-grained position to its broad role band.</summary>
        public static PositionGroup GroupOf(PlayerPosition position)
        {
            switch (position)
            {
                case PlayerPosition.GK:
                    return PositionGroup.Goalkeeper;
                case PlayerPosition.RB:
                case PlayerPosition.CB:
                case PlayerPosition.LB:
                    return PositionGroup.Defender;
                case PlayerPosition.CDM:
                case PlayerPosition.CM:
                case PlayerPosition.CAM:
                    return PositionGroup.Midfielder;
                default: // RW, LW, ST
                    return PositionGroup.Forward;
            }
        }
    }
}
