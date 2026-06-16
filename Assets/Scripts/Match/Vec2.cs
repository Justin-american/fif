using System;

namespace FIF.Match
{
    /// <summary>
    /// A small, engine-agnostic 2D vector used by the headless match simulation
    /// (Part C). Keeping the simulation off <c>UnityEngine.Vector2</c> means the
    /// whole match core can be unit-tested without the Unity runtime, while the
    /// (later) visual layer simply maps these onto world-space transforms.
    /// Coordinates are in metres on the pitch plane: <c>x</c> across the width,
    /// <c>y</c> along the length.
    /// </summary>
    public readonly struct Vec2 : IEquatable<Vec2>
    {
        public readonly float x;
        public readonly float y;

        public Vec2(float x, float y)
        {
            this.x = x;
            this.y = y;
        }

        public static readonly Vec2 Zero = new Vec2(0f, 0f);

        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.x + b.x, a.y + b.y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.x - b.x, a.y - b.y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.x * s, a.y * s);
        public static Vec2 operator *(float s, Vec2 a) => new Vec2(a.x * s, a.y * s);
        public static Vec2 operator /(Vec2 a, float s) => new Vec2(a.x / s, a.y / s);

        public float SqrMagnitude => x * x + y * y;
        public float Magnitude => (float)Math.Sqrt(x * x + y * y);

        /// <summary>Unit vector in the same direction, or zero if this is zero.</summary>
        public Vec2 Normalized
        {
            get
            {
                float m = Magnitude;
                return m > 1e-6f ? new Vec2(x / m, y / m) : Zero;
            }
        }

        public static float Distance(Vec2 a, Vec2 b) => (a - b).Magnitude;
        public static float Dot(Vec2 a, Vec2 b) => a.x * b.x + a.y * b.y;

        public static Vec2 Lerp(Vec2 a, Vec2 b, float t)
        {
            if (t < 0f) t = 0f;
            if (t > 1f) t = 1f;
            return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        }

        /// <summary>
        /// Moves <paramref name="current"/> towards <paramref name="target"/> by at
        /// most <paramref name="maxStep"/> metres (clamps so it never overshoots).
        /// </summary>
        public static Vec2 MoveTowards(Vec2 current, Vec2 target, float maxStep)
        {
            Vec2 delta = target - current;
            float dist = delta.Magnitude;
            if (dist <= maxStep || dist < 1e-6f) return target;
            return current + delta / dist * maxStep;
        }

        public bool Equals(Vec2 other) => x == other.x && y == other.y;
        public override bool Equals(object obj) => obj is Vec2 v && Equals(v);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
        public override string ToString() => $"({x:0.00}, {y:0.00})";
    }

    /// <summary>Which end of the pitch a team attacks. Home attacks +y, Away attacks -y.</summary>
    public enum TeamSide
    {
        Home,
        Away
    }
}
