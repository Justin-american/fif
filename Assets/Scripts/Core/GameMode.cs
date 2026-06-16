namespace FIF.Core
{
    /// <summary>
    /// Selects what kind of session the Match scene should set up. Carried by
    /// the GameManager from the menus into the Match scene (PART A5).
    /// </summary>
    public enum GameMode
    {
        FullMatch,
        PracticeAttack,   // attack a goal vs. GK only (no outfield defenders)
        PracticePenalty,  // repeated penalties vs. a diving keeper
        PracticeFreeKick  // repeated direct free kicks vs. wall + keeper
    }
}
