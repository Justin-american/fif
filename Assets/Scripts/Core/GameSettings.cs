using UnityEngine;

namespace FIF.Core
{
    public enum Difficulty { Beginner, SemiPro, Pro, Legendary }
    public enum PassAssistance { Assisted, Semi, Manual }
    public enum CameraStyle { Broadcast, Tele, Far }

    /// <summary>
    /// All user-configurable settings (PART A4). This is a plain serializable
    /// container; persistence is handled by load/save helpers that read & write
    /// PlayerPrefs so values survive between sessions and scenes.
    /// </summary>
    [System.Serializable]
    public class GameSettings
    {
        // --- Gameplay ---
        [Tooltip("Length of each half in minutes (3 / 5 / 7 / 10).")]
        public int matchLengthMinutes = 5;
        public Difficulty difficulty = Difficulty.SemiPro;
        public PassAssistance passAssistance = PassAssistance.Assisted;

        // --- Audio (0..1) ---
        [Range(0f, 1f)] public float masterVolume = 1f;
        [Range(0f, 1f)] public float sfxVolume = 1f;
        [Range(0f, 1f)] public float musicVolume = 0.7f;

        // --- Presentation ---
        public CameraStyle cameraStyle = CameraStyle.Broadcast;

        // PlayerPrefs keys (kept private so callers go through Load/Save).
        private const string KeyMatchLength = "fif.matchLength";
        private const string KeyDifficulty = "fif.difficulty";
        private const string KeyPassAssist = "fif.passAssist";
        private const string KeyMaster = "fif.vol.master";
        private const string KeySfx = "fif.vol.sfx";
        private const string KeyMusic = "fif.vol.music";
        private const string KeyCamera = "fif.camera";

        /// <summary>Reads settings from PlayerPrefs, falling back to defaults.</summary>
        public static GameSettings Load()
        {
            var s = new GameSettings();
            s.matchLengthMinutes = PlayerPrefs.GetInt(KeyMatchLength, s.matchLengthMinutes);
            s.difficulty = (Difficulty)PlayerPrefs.GetInt(KeyDifficulty, (int)s.difficulty);
            s.passAssistance = (PassAssistance)PlayerPrefs.GetInt(KeyPassAssist, (int)s.passAssistance);
            s.masterVolume = PlayerPrefs.GetFloat(KeyMaster, s.masterVolume);
            s.sfxVolume = PlayerPrefs.GetFloat(KeySfx, s.sfxVolume);
            s.musicVolume = PlayerPrefs.GetFloat(KeyMusic, s.musicVolume);
            s.cameraStyle = (CameraStyle)PlayerPrefs.GetInt(KeyCamera, (int)s.cameraStyle);
            return s;
        }

        /// <summary>Writes the current values to PlayerPrefs and flushes to disk.</summary>
        public void Save()
        {
            PlayerPrefs.SetInt(KeyMatchLength, matchLengthMinutes);
            PlayerPrefs.SetInt(KeyDifficulty, (int)difficulty);
            PlayerPrefs.SetInt(KeyPassAssist, (int)passAssistance);
            PlayerPrefs.SetFloat(KeyMaster, masterVolume);
            PlayerPrefs.SetFloat(KeySfx, sfxVolume);
            PlayerPrefs.SetFloat(KeyMusic, musicVolume);
            PlayerPrefs.SetInt(KeyCamera, (int)cameraStyle);
            PlayerPrefs.Save();
        }
    }
}
