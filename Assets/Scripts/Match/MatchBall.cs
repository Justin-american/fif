namespace FIF.Match
{
    /// <summary>
    /// Engine-agnostic ball physics for the headless match core (Part C). The
    /// ball lives on the 2D pitch plane (ground game) with simple linear drag so
    /// passes and shots decelerate naturally. The visual layer can add height/loft
    /// later without changing this model.
    /// </summary>
    public sealed class MatchBall
    {
        public Vec2 Position;
        public Vec2 Velocity;

        /// <summary>Linear drag (per second) that bleeds off rolling speed.</summary>
        public float Drag { get; set; } = 0.7f;

        /// <summary>Speed below which the ball is treated as stationary (m/s).</summary>
        public float StopThreshold { get; set; } = 0.15f;

        public bool IsMoving => Velocity.SqrMagnitude > StopThreshold * StopThreshold;

        public float Speed => Velocity.Magnitude;

        public MatchBall(Vec2 position)
        {
            Position = position;
            Velocity = Vec2.Zero;
        }

        /// <summary>Places the ball at a spot and stops it (used for restarts).</summary>
        public void Place(Vec2 position)
        {
            Position = position;
            Velocity = Vec2.Zero;
        }

        /// <summary>Kicks the ball in a direction at a given speed (m/s).</summary>
        public void Kick(Vec2 direction, float speed)
        {
            Velocity = direction.Normalized * speed;
        }

        /// <summary>Advances the ball by <paramref name="dt"/> seconds with drag.</summary>
        public void Tick(float dt)
        {
            if (!IsMoving)
            {
                Velocity = Vec2.Zero;
                return;
            }

            Position += Velocity * dt;

            // Exponential-style linear drag, frame-rate independent enough for sim.
            float factor = 1f - Drag * dt;
            if (factor < 0f) factor = 0f;
            Velocity = Velocity * factor;

            if (!IsMoving) Velocity = Vec2.Zero;
        }
    }
}
