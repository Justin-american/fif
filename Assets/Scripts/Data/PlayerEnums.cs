namespace FIF.Data
{
    /// <summary>
    /// On-pitch position roles. Used for formation placement, AI role
    /// selection and squad validation.
    /// </summary>
    public enum PlayerPosition
    {
        GK,
        RB,
        CB,
        LB,
        CDM,
        CM,
        CAM,
        RW,
        LW,
        ST
    }

    /// <summary>Which foot the player favours for striking the ball.</summary>
    public enum PreferredFoot
    {
        Right,
        Left
    }

    /// <summary>
    /// Data-driven behaviour archetypes (PART C10). Two players sharing a
    /// position but with different play styles must behave differently
    /// once the gameplay AI consumes this value.
    /// </summary>
    public enum PlayStyle
    {
        None,
        Poacher,            // lurks on the last defender, far-post runs
        Playmaker,          // drops deep, prioritises through balls
        InsideForward,      // cuts inside onto the stronger foot to shoot
        SpeedDribbler,      // knock-and-run into space
        TargetMan,          // holds the ball up, wins headers
        FinesseSpecialist,  // favours finesse shots from the edge of the box
        NoNonsenseDefender, // clears first time, rarely dribbles out
        BoxToBox,           // covers ground both ways
        AnchorHolding       // screens the back line, recycles possession
    }
}
