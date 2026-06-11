# Lunar Lander // Retro 1996 Edition

A client-side, browser-based recreation of the classic **Lunar Lander** arcade game, styled with a 90s cyberpunk/retro CRT aesthetic. 

Live Demo: [https://lunar-lander.web.app](https://lunar-lander.web.app)

---

## Features

*   **90s Retro Vibe**: Simulates an old CRT monitor complete with scanlines, screen glow, and refresh flicker.
*   **Vector Graphics**: Drawn entirely using HTML5 Canvas vector-style lines, mimicking early vector arcade monitors.
*   **Synthesized 8-Bit Audio**: Uses the **Web Audio API** to generate sound effects directly in the browser without static audio files:
    *   Low-frequency thrust rumble.
    *   Pitch-drop crash explosion.
    *   Retro arpeggio chime for successful landings.
*   **2D Physics**: Simulated gravity, thrust vectoring, and rotation controls.
*   **Landing Dashboard**: Live telemetry reporting Horizontal Speed, Vertical Speed, Fuel levels, and Angle.

---

## How to Play

### Controls
*   **Arrow Left (◀) / Arrow Right (▶)**: Rotate the lander.
*   **Arrow Up (▲) / Spacebar**: Fire the main thruster to counteract gravity.
*   **Enter**: Start the game / Try again.

### Rules
To land successfully, you must touch down on the **flashing cyan landing pad** while meeting the following safe landing criteria:
1.  **Vertical Speed** must be low (dashboard indicator will flash red if too fast).
2.  **Horizontal Speed** (drift) must be minimal.
3.  **Lander Angle** must be nearly upright (close to 0 degrees).

Landing anywhere else on the green terrain or failing to meet the safety metrics will result in a crash!

---

## Local Development

Since the game is entirely client-side, you can run it locally using any static file server.

### Example using Python
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000/public` in your browser.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
